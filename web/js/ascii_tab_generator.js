/**
 * ASCII Tablature Generator
 * Formats parsed Guitar Pro tracks into clean, monospace ASCII tab sheets.
 */

export function generateAsciiTab(score, trackIdx = 0, barsPerRow = 2) {
    if (!score || !score.tracks || score.tracks.length === 0) {
        return "No tracks available in score.";
    }

    const track = score.tracks[trackIdx] || score.tracks[0];
    const stringCount = track.stringCount;

    // Build tuning labels (string 0 in GPIF is top/highest pitch string)
    const tuningLabels = [];
    for (let s = 0; s < stringCount; s++) {
        const tuningIdx = stringCount - 1 - s;
        if (tuningIdx >= 0 && tuningIdx < track.tuningNames.length) {
            const noteStr = track.tuningNames[tuningIdx];
            const letter = s === 0 ? noteStr[0].toLowerCase() : noteStr[0].toUpperCase();
            tuningLabels.push(letter);
        } else {
            tuningLabels.push("-");
        }
    }

    const bars = score.getTrackBars(score.tracks.indexOf(track));
    const outputLines = [];

    const title = score.metadata?.title || score.metadata?.subTitle || score.metadata?.name || score.title || "Untitled";
    const artist = score.metadata?.artist || score.metadata?.music || score.metadata?.words || score.metadata?.author || score.metadata?.composer || score.artist || "Unknown";
    const album = score.metadata?.album || score.metadata?.collection || score.album || "";

    const primaryTime = score.getPrimaryTimeSignature ? score.getPrimaryTimeSignature() : (score.masterbars[0]?.time || "4/4");
    const hasPickup = score.hasPickupMeasure ? score.hasPickupMeasure() : false;
    const timeDisplay = hasPickup ? `${primaryTime} (Pickup ${score.masterbars[0].time})` : primaryTime;

    // Header Box
    const width = 80;
    outputLines.push("═".repeat(width));
    outputLines.push(` TAB: ${title}`);
    outputLines.push(` ARTIST: ${artist}${album ? `  │  ALBUM: ${album}` : ""}  │  TEMPO: ${score.tempo} BPM  │  TIME: ${timeDisplay}`);
    outputLines.push(` TRACK ${track.id + 1}: ${track.name}`);
    outputLines.push(` TUNING: ${track.tuningNames.join(" ")} (Capo: ${track.capo})`);
    outputLines.push("═".repeat(width));
    outputLines.push("");

    const numBars = bars.length;
    for (let rowStart = 0; rowStart < numBars; rowStart += barsPerRow) {
        const rowBars = bars.slice(rowStart, Math.min(rowStart + barsPerRow, numBars));

        // Section markers
        const sectionTitles = [];
        rowBars.forEach(b => {
            if (b.section) {
                const desc = b.section.text ? ` (${b.section.text})` : "";
                sectionTitles.push(`═══ ${b.section.name}${desc} ═══`);
            }
        });

        if (sectionTitles.length > 0) {
            outputLines.push("");
            outputLines.push("  " + sectionTitles.join("  │  "));
        }

        const chordLineParts = ["    "];
        const measureHeaderParts = ["    "];
        const strLines = {};
        for (let s = 0; s < stringCount; s++) {
            strLines[s] = `${tuningLabels[s]}|`;
        }

        rowBars.forEach(b => {
            const mNum = `Bar ${b.measureNumber} [${b.time}]`;
            const beats = b.beats;

            const colSlots = [];
            beats.forEach(beat => {
                const chord = beat.chord || "";
                const notesByString = {};
                (beat.notes || []).forEach(n => {
                    notesByString[n.string] = n;
                });
                colSlots.push({
                    chord,
                    notes: notesByString,
                    pm: beat.palmMute
                });
            });

            if (colSlots.length === 0) {
                colSlots.push({ chord: "", notes: {}, pm: false });
            }

            const barStrBuffers = {};
            for (let s = 0; s < stringCount; s++) barStrBuffers[s] = "";
            let barChordBuffer = "";

            colSlots.forEach(slot => {
                const chord = slot.chord;
                let maxW = 3;
                const slotFrets = {};

                for (let s = 0; s < stringCount; s++) {
                    if (s in slot.notes) {
                        const n = slot.notes[s];
                        let txt = String(n.fret);
                        if (n.hopo) txt += "h";
                        else if (n.bend) txt += "b";
                        else if (n.slide) txt += "/";
                        else if (n.vibrato) txt += "~";
                        slotFrets[s] = txt;
                        maxW = Math.max(maxW, txt.length + 2);
                    } else {
                        slotFrets[s] = "-";
                    }
                }

                if (chord) {
                    maxW = Math.max(maxW, chord.length + 1);
                }

                for (let s = 0; s < stringCount; s++) {
                    const fTxt = slotFrets[s];
                    const seg = fTxt === "-" ? "-".repeat(maxW) : `-${fTxt}`.padEnd(maxW, "-");
                    barStrBuffers[s] += seg;
                }

                const cSeg = chord ? chord.padEnd(maxW, " ") : " ".repeat(maxW);
                barChordBuffer += cSeg;
            });

            const barLen = barStrBuffers[0].length;
            const mHdr = mNum.padEnd(barLen + 1, " ");
            measureHeaderParts.push(mHdr);
            chordLineParts.push(barChordBuffer + " ");

            for (let s = 0; s < stringCount; s++) {
                strLines[s] += barStrBuffers[s] + "|";
            }
        });

        outputLines.push(chordLineParts.join(""));
        outputLines.push(measureHeaderParts.join(""));
        for (let s = 0; s < stringCount; s++) {
            outputLines.push(strLines[s]);
        }
        outputLines.push("");
    }

    return outputLines.join("\n");
}
