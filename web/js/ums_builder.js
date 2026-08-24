/**
 * Client-Side Unified Music Schema (UMS) Builder & Fusion Engine
 * Merges parsed Guitar Pro score models with PDF chord sheets & lead sheets
 * to produce the canonical tri-layer UMS SongGraph (Layer A, Layer B, Layer C).
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midiPitch) {
    if (midiPitch < 0 || midiPitch > 127) return `?(${midiPitch})`;
    const name = NOTE_NAMES[midiPitch % 12];
    const octave = Math.floor(midiPitch / 12) - 1;
    return `${name}${octave}`;
}

const DURATIONS = {
    Whole: 4.0,
    Half: 2.0,
    Quarter: 1.0,
    Eighth: 0.5,
    "16th": 0.25,
    Sixteenth: 0.25,
    "32nd": 0.125,
    ThirtySecond: 0.125,
    "64th": 0.0625,
    SixtyFourth: 0.0625
};

function getBeatDuration(rhythm) {
    if (!rhythm) return 1.0;
    const noteVal = rhythm.note_value || rhythm.noteValue || "Quarter";
    let base = DURATIONS[noteVal] || 1.0;
    const dots = rhythm.dots || 0;
    if (dots === 1) base *= 1.5;
    else if (dots === 2) base *= 1.75;
    const tuplet = rhythm.tuplet;
    if (tuplet && tuplet.length === 2 && tuplet[0] > 0) {
        base *= (tuplet[1] / tuplet[0]);
    }
    return base;
}

export function buildCompleteUmsClient(gpScore, pdfChordData = null, pdfScoreData = null) {
    if (!gpScore) return null;

    const pdfMeta = pdfChordData?.metadata || {};
    const secMeta = pdfScoreData?.metadata || {};

    const title = pdfMeta.title || secMeta.title || gpScore.metadata?.title || "Untitled";
    const artist = pdfMeta.artist || secMeta.artist || gpScore.metadata?.artist || "Unknown Artist";
    const album = gpScore.metadata?.album || null;
    const originalKey = pdfMeta.key || secMeta.key || "D";
    const tempoBpm = gpScore.tempo || pdfMeta.tempo_bpm || 120;
    const timeSig = gpScore.getPrimaryTimeSignature ? gpScore.getPrimaryTimeSignature() : (gpScore.masterbars[0]?.time || "4/4");
    const strumPattern = pdfMeta.strum_pattern || secMeta.strum_pattern || null;

    const primaryTrack = gpScore.tracks[0] || {
        id: 0,
        name: "Primary",
        tuningNames: ["E2", "A2", "D3", "G3", "B3", "E4"],
        tuningPitches: [40, 45, 50, 55, 59, 64],
        capo: 0,
        stringCount: 6,
        color: "255,140,0"
    };
    const tuningPitches = primaryTrack.tuningPitches || [40, 45, 50, 55, 59, 64];
    const stringCount = tuningPitches.length;
    const capo = primaryTrack.capo || 0;

    const pdfSections = pdfChordData?.structure || [];
    const trackBars = gpScore.getTrackBars(0);
    const totalBars = trackBars.length;

    // Allocate section measure ranges
    const sectionMapRanges = [];
    if (pdfSections.length > 0) {
        const cleanSecs = pdfSections.filter(s => s.lines?.length > 0 || s.chords?.length > 0);
        const activeSecs = cleanSecs.length > 0 ? cleanSecs : pdfSections;

        const weights = activeSecs.map(s => {
            const numLines = Math.max(1, s.lines?.length || 0);
            const numChords = Math.max(1, s.chords?.length || 0);
            return Math.max(numLines * 2, numChords);
        });

        const totalW = weights.reduce((a, b) => a + b, 0) || 1;
        let curBar = 1;

        activeSecs.forEach((sec, idx) => {
            let barsForSec;
            if (idx === activeSecs.length - 1) {
                barsForSec = Math.max(1, totalBars - curBar + 1);
            } else {
                barsForSec = Math.max(2, Math.round((weights[idx] / totalW) * totalBars));
                if (curBar + barsForSec - 1 >= totalBars) {
                    barsForSec = Math.max(1, totalBars - curBar);
                }
            }

            const startBar = curBar;
            const endBar = Math.min(curBar + barsForSec - 1, totalBars);

            sectionMapRanges.push({
                sectionIndex: idx,
                name: sec.name,
                startBar,
                endBar,
                pdfSection: sec
            });

            curBar = endBar + 1;
        });
    } else {
        sectionMapRanges.push({
            sectionIndex: 0,
            name: "Full Song",
            startBar: 1,
            endBar: totalBars,
            pdfSection: null
        });
    }

    // Build Structure Blocks & Tri-Layer Measure Events
    const reconciliationLog = [];
    const structureBlocks = [];

    for (const sRange of sectionMapRanges) {
        const sName = sRange.name;
        const startB = sRange.startBar;
        const endB = sRange.endBar;
        const pdfSec = sRange.pdfSection;

        const measuresList = [];
        const barSubset = trackBars.filter(b => b.measureNumber >= startB && b.measureNumber <= endB);

        const secChords = [];
        const secLyrics = [];
        if (pdfSec) {
            for (const line of (pdfSec.lines || [])) {
                for (const ce of (line.chord_events || [])) {
                    secChords.push(ce.chord);
                }
                if (line.lyric_line) {
                    secLyrics.push(line.lyric_line);
                }
            }
        }

        let chordIdx = 0;
        for (const b of barSubset) {
            const mNum = b.measureNumber;
            const mTime = b.time;
            const clefVal = b.clef || "treble";
            const events = [];
            let curBeatDivision = 1.0;

            if (b.beats && b.beats.length > 0) {
                b.beats.forEach((beat, bIdx) => {
                    const rhythmObj = beat.rhythm || {};
                    const rhythmName = rhythmObj.note_value || rhythmObj.noteValue || "Quarter";
                    const durVal = getBeatDuration(rhythmObj);
                    const beatDynamic = beat.dynamic || "mf";

                    // Build Layer B (Tablature) & Layer C (Notation)
                    const notesTab = [];
                    const notesNotation = [];

                    (beat.notes || []).forEach(n => {
                        if (n) {
                            const sIdx = n.string !== undefined ? n.string : 0;
                            const fVal = n.fret !== undefined ? n.fret : 0;
                            notesTab.push({
                                string: sIdx,
                                fret: fVal,
                                hopo: n.hopo || false,
                                bend: n.bend || null,
                                slide: n.slide || null,
                                vibrato: n.vibrato || false,
                                palm_mute: n.palmMute || n.palm_mute || false
                            });

                            // MIDI Pitch: TuningPitch + Fret + Capo
                            const tIdx = stringCount - 1 - sIdx;
                            const openPitch = (tIdx >= 0 && tIdx < stringCount) ? tuningPitches[tIdx] : 64;
                            const midiPitch = openPitch + fVal + capo;
                            const pitchName = midiToNoteName(midiPitch);

                            notesNotation.push({
                                pitch: pitchName,
                                midi_pitch: midiPitch,
                                duration: rhythmName,
                                dynamics: beatDynamic
                            });
                        }
                    });

                    // Build Layer A (Chords & Lyrics with Conflict Resolution)
                    let gpChord = beat.chord || null;
                    let hardFault = null;
                    let assignedChord = null;

                    if (gpChord) {
                        assignedChord = gpChord;
                        if (bIdx === 0 && secChords.length > 0) {
                            const pdfChord = secChords[chordIdx % secChords.length];
                            if (pdfChord !== gpChord) {
                                reconciliationLog.push({
                                    measure_number: mNum,
                                    beat_division: Math.round(curBeatDivision * 1000) / 1000,
                                    type: "chord_discrepancy",
                                    gp_value: gpChord,
                                    pdf_value: pdfChord,
                                    resolution: "applied_rich_pdf_chord"
                                });
                                hardFault = {
                                    type: "chord_discrepancy",
                                    gp_chord: gpChord,
                                    pdf_chord: pdfChord,
                                    resolution: "applied_rich_pdf_chord"
                                };
                                assignedChord = pdfChord;
                                chordIdx++;
                            }
                        }
                    } else if (bIdx === 0 && secChords.length > 0) {
                        assignedChord = secChords[chordIdx % secChords.length];
                        chordIdx++;
                    }

                    // Lyrics
                    let assignedLyric = beat.lyrics || beat.text || null;
                    if (assignedLyric === "_") assignedLyric = null;

                    events.push({
                        beat_division: Math.round(curBeatDivision * 1000) / 1000,
                        layer_a: {
                            chord: assignedChord,
                            lyrics: assignedLyric
                        },
                        layer_b: {
                            tab_positions: notesTab,
                            rhythm: rhythmName
                        },
                        layer_c: {
                            clef: clefVal,
                            notes: notesNotation
                        },
                        hard_fault: hardFault
                    });

                    curBeatDivision += durVal;
                });
            } else {
                let assignedChord = secChords.length > 0 ? secChords[chordIdx % secChords.length] : null;
                if (assignedChord) chordIdx++;

                events.push({
                    beat_division: 1.0,
                    layer_a: {
                        chord: assignedChord,
                        lyrics: null
                    },
                    layer_b: {
                        tab_positions: [],
                        rhythm: "Whole"
                    },
                    layer_c: {
                        clef: clefVal,
                        notes: []
                    },
                    hard_fault: null
                });
            }

            measuresList.push({
                measure_index: mNum,
                measure_number: mNum,
                time_signature: mTime,
                events,
                musical_events: events
            });
        }

        structureBlocks.push({
            block_name: sName,
            sectionId: `sec_${sRange.sectionIndex}`,
            sectionLabel: sName,
            section_overrides: {
                tempo_bpm: tempoBpm,
                time_signature: measuresList[0]?.time_signature || timeSig,
                has_pickup: (startB === 1 && (gpScore.hasPickupMeasure ? gpScore.hasPickupMeasure() : false)),
                strum_pattern: strumPattern
            },
            measures: measuresList
        });
    }

    const allChords = new Set([
        ...(pdfMeta.chords_detected || []),
        ...(secMeta.chords_detected || []),
        ...(gpScore.getAllChords ? gpScore.getAllChords() : [])
    ]);

    return {
        schema_version: "1.1.0",
        canonical: {
            title,
            artist,
            album,
            genre: gpScore.metadata?.genre || null,
            transcriber: gpScore.metadata?.tabber || "Antigravity Ingestion Engine",
            copyright: gpScore.metadata?.copyright || null,
            original_key: originalKey,
            original_tempo_bpm: tempoBpm,
            original_time_signature: timeSig,
            original_tuning: primaryTrack.tuningNames.join(" "),
            original_capo: primaryTrack.capo,
            strum_pattern: strumPattern,
            chords_detected: Array.from(allChords).sort(),
            tags: ["guitar_pro", "pdf_ocr", "unified_music_schema", "cadence"]
        },
        tracks: gpScore.tracks.map(t => ({
            id: t.id,
            name: t.name,
            tuning: t.tuningNames,
            tuning_pitches: t.tuningPitches,
            capo: t.capo,
            string_count: t.stringCount,
            color: t.color
        })),
        structure: structureBlocks,
        reconciliation_log: reconciliationLog,
        requires_agent_intervention: false
    };
}

export function normalizeUmsPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;

    const canonical = payload.canonical || {};
    const capo = canonical.original_capo || 0;
    const tuningPitches = [40, 45, 50, 55, 59, 64];

    (payload.structure || []).forEach(block => {
        (block.measures || []).forEach(measure => {
            const rawEvents = measure.musical_events || measure.events || [];
            const normalizedEvents = [];
            let curBeat = 1.0;

            rawEvents.forEach(ev => {
                if (ev.layer_a && ev.layer_b && ev.layer_c) {
                    normalizedEvents.push(ev);
                    return;
                }

                const chordVal = ev.layer_a_chord || ev.chord || null;
                const lyricVal = ev.text || ev.lyrics || null;
                const rhythmVal = ev.rhythm || "Quarter";
                const durBase = DURATIONS[rhythmVal] || 1.0;

                const tabPositions = ev.layer_b_tab || ev.tab_positions || [];
                const notesNotation = [];

                tabPositions.forEach(tp => {
                    const sIdx = tp.string || 0;
                    const fVal = tp.fret || 0;
                    const tIdx = tuningPitches.length - 1 - sIdx;
                    const openPitch = (tIdx >= 0 && tIdx < tuningPitches.length) ? tuningPitches[tIdx] : 64;
                    const midiPitch = openPitch + fVal + capo;
                    notesNotation.push({
                        pitch: midiToNoteName(midiPitch),
                        midi_pitch: midiPitch,
                        duration: rhythmVal,
                        dynamics: "mf"
                    });
                });

                const beatDiv = ev.beat_division !== undefined ? ev.beat_division : Math.round(curBeat * 1000) / 1000;

                normalizedEvents.push({
                    beat_division: beatDiv,
                    layer_a: {
                        chord: chordVal,
                        lyrics: lyricVal
                    },
                    layer_b: {
                        tab_positions: tabPositions,
                        rhythm: rhythmVal
                    },
                    layer_c: {
                        clef: "treble",
                        notes: notesNotation
                    },
                    hard_fault: ev.hard_fault || null
                });

                curBeat += durBase;
            });

            measure.events = normalizedEvents;
            measure.musical_events = normalizedEvents;
        });
    });

    payload.schema_version = "1.1.0";
    return payload;
}
