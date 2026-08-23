/**
 * Guitar Pro (.gp / .gpif) XML and Zip Archive Parser for the Web
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToNoteName(midiPitch) {
    if (midiPitch < 0 || midiPitch > 127) return `?(${midiPitch})`;
    const name = NOTE_NAMES[midiPitch % 12];
    const octave = Math.floor(midiPitch / 12) - 1;
    return `${name}${octave}`;
}

export async function parseGuitarProFile(fileOrBuffer) {
    let xmlText = "";
    let rawBytes = null;
    let fileName = "file.gp";

    if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
        fileName = fileOrBuffer.name || "song.gp";
        rawBytes = await fileOrBuffer.arrayBuffer();
    } else if (fileOrBuffer instanceof ArrayBuffer) {
        rawBytes = fileOrBuffer;
    } else if (typeof fileOrBuffer === "string") {
        xmlText = fileOrBuffer;
    }

    if (!xmlText && rawBytes) {
        // Try unzipping with JSZip
        if (window.JSZip) {
            try {
                const zip = await window.JSZip.loadAsync(rawBytes);
                let targetFile = null;
                zip.forEach((relativePath, zipEntry) => {
                    if (relativePath.endsWith("score.gpif") || relativePath.endsWith(".gpif") || relativePath.endsWith(".xml")) {
                        targetFile = zipEntry;
                    }
                });

                if (targetFile) {
                    xmlText = await targetFile.async("text");
                }
            } catch (err) {
                console.warn("JSZip failed to read as zip, attempting UTF-8 text decode:", err);
            }
        }

        // If not unzipped or JSZip not present, try direct text decode (for raw .gpif)
        if (!xmlText) {
            const decoder = new TextDecoder("utf-8");
            const decoded = decoder.decode(rawBytes);
            if (decoded.includes("<gpif") || decoded.includes("<?xml")) {
                xmlText = decoded;
            }
        }
    }

    if (!xmlText) {
        throw new Error("Could not extract 'score.gpif' XML from the Guitar Pro file. Please ensure it is a valid .gp or .gpif file.");
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        throw new Error("XML Parsing error in score.gpif: " + parserError.textContent);
    }

    return new GuitarProScoreModel(xmlDoc, rawBytes, xmlText);
}

export class GuitarProScoreModel {
    constructor(xmlDoc, rawBytes = null, rawXml = "") {
        this.doc = xmlDoc;
        this.rawBytes = rawBytes;
        this.rawXml = rawXml;
        this.metadata = {};
        this.tempo = 120;
        this.automations = [];
        this.sections = new Map();
        this.tracks = [];
        this.masterbars = [];
        this.rhythms = new Map();
        this.notes = new Map();
        this.beats = new Map();
        this.voices = new Map();
        this.bars = new Map();
        this._parse();
    }

    _findChild(elem, tag) {
        if (!elem) return null;
        const target = tag.toLowerCase();
        for (const c of elem.children) {
            if (c.tagName.toLowerCase() === target) return c;
        }
        return null;
    }

    _findChildren(elem, tag) {
        if (!elem) return [];
        const target = tag.toLowerCase();
        const res = [];
        for (const c of elem.children) {
            if (c.tagName.toLowerCase() === target) res.push(c);
        }
        return res;
    }

    _getText(elem, tag, defaultVal = "") {
        const c = this._findChild(elem, tag);
        if (c && c.textContent) return c.textContent.trim();
        return defaultVal;
    }

    _getProp(elem, propName) {
        if (!elem) return null;
        const props = this._findChild(elem, "properties");
        if (!props) return null;
        const target = propName.toLowerCase();
        for (const p of this._findChildren(props, "property")) {
            if ((p.getAttribute("name") || "").toLowerCase() === target) {
                for (const valElem of p.children) {
                    if (valElem.textContent && valElem.textContent.trim()) {
                        return valElem.textContent.trim();
                    }
                }
                if (p.textContent && p.textContent.trim()) {
                    return p.textContent.trim();
                }
            }
        }
        return null;
    }

    _parse() {
        const root = this.doc.documentElement;

        // 1. Metadata (<Score> / <score>)
        const scoreNode = this._findChild(root, "score");
        if (scoreNode) {
            for (const child of scoreNode.children) {
                const val = (child.textContent || "").trim();
                if (val) {
                    this.metadata[child.tagName.toLowerCase()] = val;
                    this.metadata[child.tagName] = val;
                }
            }
        }

        // Normalize Title, Artist, Album, Transcriber
        const rawTitle = this.metadata.title || this.metadata.subtitle || this.metadata.name || "";
        const rawArtist = this.metadata.artist || this.metadata.music || this.metadata.words || this.metadata.author || this.metadata.composer || this.metadata.band || "";
        const rawAlbum = this.metadata.album || this.metadata.collection || "";
        const rawTabber = this.metadata.tabber || this.metadata.transcriber || "";

        if (rawTitle && !this.metadata.title) this.metadata.title = rawTitle;
        if (rawArtist && !this.metadata.artist) this.metadata.artist = rawArtist;
        if (rawAlbum && !this.metadata.album) this.metadata.album = rawAlbum;
        if (rawTabber && !this.metadata.tabber) this.metadata.tabber = rawTabber;

        // Convenience properties
        this.title = this.metadata.title || "Untitled";
        this.artist = this.metadata.artist || "Unknown Artist";
        this.album = this.metadata.album || "";

        // 2. Master Track (<MasterTrack> / <mastertrack>)
        const masterTrack = this._findChild(root, "mastertrack");
        if (masterTrack) {
            const autoNode = this._findChild(masterTrack, "automations");
            if (autoNode) {
                const autoNodes = this._findChildren(autoNode, "automation");
                autoNodes.forEach(a => {
                    const type = this._getText(a, "type");
                    const val = this._getText(a, "value");
                    const pos = parseInt(this._getText(a, "position", "0"), 10);
                    if (type.toLowerCase() === "tempo" && val) {
                        const bpm = parseFloat(val.split(" ")[0]);
                        this.automations.push({ type: "tempo", bpm, position: pos });
                        if (pos === 0) this.tempo = Math.round(bpm);
                    }
                });
            }

            const secNode = this._findChild(masterTrack, "sections");
            if (secNode) {
                const secNodes = this._findChildren(secNode, "section");
                secNodes.forEach(s => {
                    const id = parseInt(s.getAttribute("id") || "0", 10);
                    const name = this._getText(s, "name");
                    const text = this._getText(s, "text");
                    this.sections.set(id, { id, name, text });
                });
            }
        }

        // 3. Tracks (<Tracks> / <tracks>)
        const tracksNode = this._findChild(root, "tracks");
        if (tracksNode) {
            const trackNodes = this._findChildren(tracksNode, "track");
            trackNodes.forEach((t, idx) => {
                const id = parseInt(t.getAttribute("id") || `${idx}`, 10);
                const name = this._getText(t, "name", `Track ${id + 1}`);
                const color = this._getText(t, "color", "255,140,0");

                let tuningPitches = [40, 45, 50, 55, 59, 64];
                let capo = 0;

                const tuningStr = this._getProp(t, "tuning");
                if (tuningStr) {
                    tuningPitches = tuningStr.split(/\s+/).map(Number);
                }
                const capoStr = this._getProp(t, "capofret");
                if (capoStr) {
                    capo = parseInt(capoStr, 10);
                }

                // Check Staves > Staff > Properties
                const stavesNode = this._findChild(t, "staves");
                if (stavesNode) {
                    for (const s of this._findChildren(stavesNode, "staff")) {
                        const sTuning = this._getProp(s, "tuning");
                        if (sTuning) {
                            tuningPitches = sTuning.split(/\s+/).map(Number);
                        }
                        const sCapo = this._getProp(s, "capofret");
                        if (sCapo) {
                            capo = parseInt(sCapo, 10);
                        }
                    }
                }

                const tuningNames = tuningPitches.map(midiToNoteName);
                this.tracks.push({
                    id,
                    name,
                    color,
                    tuningPitches,
                    tuningNames,
                    stringCount: tuningPitches.length,
                    capo
                });
            });
        }

        // 4. Rhythms (<Rhythms> / <rhythms>)
        const rhythmsNode = this._findChild(root, "rhythms");
        if (rhythmsNode) {
            const rhythmNodes = this._findChildren(rhythmsNode, "rhythm");
            rhythmNodes.forEach((r, idx) => {
                const id = parseInt(r.getAttribute("id") || `${idx}`, 10);
                const noteValue = this._getText(r, "notevalue", "Quarter");
                const tupletElem = this._findChild(r, "primarytuplet");
                const tuplet = tupletElem ? [parseInt(tupletElem.getAttribute("num") || "3", 10), parseInt(tupletElem.getAttribute("den") || "2", 10)] : null;
                const dots = parseInt(this._getText(r, "augmentationdot", "0"), 10);
                this.rhythms.set(id, { id, noteValue, tuplet, dots });
            });
        }

        // 5. Notes (<Notes> / <notes>)
        const notesNode = this._findChild(root, "notes");
        if (notesNode) {
            const noteNodes = this._findChildren(notesNode, "note");
            noteNodes.forEach((n, idx) => {
                const id = parseInt(n.getAttribute("id") || `${idx}`, 10);
                let fret = 0;
                let stringIdx = 0;
                let tie = false;
                let hopo = false;
                let bend = null;
                let slide = null;
                let palmMute = false;
                let vibrato = false;

                const fretStr = this._getProp(n, "fret");
                if (fretStr) fret = parseInt(fretStr, 10);

                const stringStr = this._getProp(n, "string");
                if (stringStr) stringIdx = parseInt(stringStr, 10);

                const tieStr = this._getProp(n, "tie");
                if (tieStr && tieStr.toLowerCase() === "true") tie = true;

                const hopoOrig = this._getProp(n, "hopoorigin");
                const hopoDest = this._getProp(n, "hopodestination");
                if ((hopoOrig && hopoOrig.toLowerCase() === "true") || (hopoDest && hopoDest.toLowerCase() === "true")) hopo = true;

                const bendVal = this._getProp(n, "bend");
                if (bendVal) bend = bendVal;

                const slideVal = this._getProp(n, "slide");
                if (slideVal) slide = slideVal;

                const pmStr = this._getProp(n, "palmmute");
                if (pmStr && pmStr.toLowerCase() === "true") palmMute = true;

                const vibStr = this._getProp(n, "vibrato");
                if (vibStr && vibStr.toLowerCase() === "true") vibrato = true;

                this.notes.set(id, { id, fret, string: stringIdx, tie, hopo, bend, slide, palmMute, vibrato });
            });
        }

        // 6. Beats (<Beats> / <beats>)
        const beatsNode = this._findChild(root, "beats");
        if (beatsNode) {
            const beatNodes = this._findChildren(beatsNode, "beat");
            beatNodes.forEach((b, idx) => {
                const id = parseInt(b.getAttribute("id") || `${idx}`, 10);
                const rNode = this._findChild(b, "rhythm");
                const rhythmRef = parseInt(rNode?.getAttribute("ref") || "0", 10);
                const notesText = this._getText(b, "notes");
                const noteIds = notesText.trim() ? notesText.trim().split(/\s+/).map(Number) : [];

                const chord = this._getProp(b, "chord");
                const text = this._getProp(b, "freetext") || this._getProp(b, "text");
                const pmStr = this._getProp(b, "palmmute");
                const palmMute = pmStr ? pmStr.toLowerCase() === "true" : false;
                const pickStroke = this._getProp(b, "pickstroke");

                this.beats.set(id, { id, rhythmRef, noteIds, chord, text, palmMute, pickStroke });
            });
        }

        // 7. Voices (<Voices> / <voices>)
        const voicesNode = this._findChild(root, "voices");
        if (voicesNode) {
            const voiceNodes = this._findChildren(voicesNode, "voice");
            voiceNodes.forEach((v, idx) => {
                const id = parseInt(v.getAttribute("id") || `${idx}`, 10);
                const beatsText = this._getText(v, "beats");
                const beatIds = beatsText.trim() ? beatsText.trim().split(/\s+/).map(Number).filter(x => x >= 0) : [];
                this.voices.set(id, { id, beatIds });
            });
        }

        // 8. Bars (<Bars> / <bars>)
        const barsNode = this._findChild(root, "bars");
        if (barsNode) {
            const barNodes = this._findChildren(barsNode, "bar");
            barNodes.forEach((bar, idx) => {
                const id = parseInt(bar.getAttribute("id") || `${idx}`, 10);
                const voicesText = this._getText(bar, "voices");
                const voiceIds = voicesText.trim() ? voicesText.trim().split(/\s+/).map(Number).filter(x => x >= 0) : [];
                this.bars.set(id, { id, voiceIds });
            });
        }

        // 9. Masterbars (<MasterBars> / <masterbars>)
        const mbNode = this._findChild(root, "masterbars");
        if (mbNode) {
            const mbNodes = this._findChildren(mbNode, "masterbar");
            mbNodes.forEach((mb, idx) => {
                const id = parseInt(mb.getAttribute("id") || `${idx}`, 10);
                const time = this._getText(mb, "time", "4/4");
                const barsText = this._getText(mb, "bars");
                const barIds = barsText.trim() ? barsText.trim().split(/\s+/).map(Number).filter(x => x >= 0) : [];

                let sectionId = null;
                const secElem = this._findChild(mb, "section");
                if (secElem) {
                    sectionId = parseInt(secElem.getAttribute("id") || "0", 10);
                }

                this.masterbars.push({ id, time, barIds, sectionId });
            });
        }
    }

    getTrackBars(trackIdx = 0) {
        if (trackIdx < 0 || trackIdx >= this.tracks.length) return [];

        const resultBars = [];
        this.masterbars.forEach((mb, mbIdx) => {
            const barData = {
                measureNumber: mbIdx + 1,
                time: mb.time,
                section: mb.sectionId !== null && this.sections.has(mb.sectionId) ? this.sections.get(mb.sectionId) : null,
                beats: []
            };

            if (trackIdx < mb.barIds.length) {
                const barId = mb.barIds[trackIdx];
                const barObj = this.bars.get(barId);
                if (barObj && barObj.voiceIds.length > 0) {
                    const voiceId = barObj.voiceIds[0];
                    const voiceObj = this.voices.get(voiceId);
                    if (voiceObj) {
                        voiceObj.beatIds.forEach(beatId => {
                            const beatObj = this.beats.get(beatId);
                            if (beatObj) {
                                const beatInfo = {
                                    id: beatId,
                                    rhythm: this.rhythms.get(beatObj.rhythmRef) || { noteValue: "Quarter" },
                                    chord: beatObj.chord,
                                    text: beatObj.text,
                                    palmMute: beatObj.palmMute,
                                    pickStroke: beatObj.pickStroke,
                                    notes: beatObj.noteIds.map(nId => this.notes.get(nId)).filter(Boolean)
                                };
                                barData.beats.push(beatInfo);
                            }
                        });
                    }
                }
            }

            resultBars.push(barData);
        });

        return resultBars;
    }

    getAllChords() {
        const chords = new Set();
        this.beats.forEach(b => {
            if (b.chord) chords.add(b.chord);
        });
        return Array.from(chords).sort();
    }

    getPrimaryTimeSignature() {
        if (!this.masterbars || this.masterbars.length === 0) return "4/4";
        const counts = {};
        for (const mb of this.masterbars) {
            const t = mb.time || "4/4";
            counts[t] = (counts[t] || 0) + 1;
        }
        let bestSig = "4/4";
        let maxCount = -1;
        for (const [sig, count] of Object.entries(counts)) {
            if (count > maxCount) {
                maxCount = count;
                bestSig = sig;
            }
        }
        return bestSig;
    }

    hasPickupMeasure() {
        if (!this.masterbars || this.masterbars.length < 2) return false;
        const primary = this.getPrimaryTimeSignature();
        const first = this.masterbars[0].time;
        return first !== primary;
    }
}
