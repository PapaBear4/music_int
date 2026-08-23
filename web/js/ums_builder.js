/**
 * Client-Side Unified Music Schema (UMS) Builder & Fusion Engine
 * Merges parsed Guitar Pro score models with PDF chord sheets & lead sheets.
 */

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
        capo: 0,
        stringCount: 6,
        color: "255,140,0"
    };

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

    // Build Structure Blocks
    const structureBlocks = [];
    for (const sRange of sectionMapRanges) {
        const sName = sRange.name;
        const startB = sRange.startBar;
        const endB = sRange.endBar;
        const pdfSec = sRange.pdfSection;

        const measuresList = [];
        const barSubset = trackBars.filter(b => b.measureNumber >= startB && b.measureNumber <= endB);

        const secChords = [];
        if (pdfSec) {
            for (const line of (pdfSec.lines || [])) {
                for (const ce of (line.chord_events || [])) {
                    secChords.push(ce.chord);
                }
            }
        }

        let chordIdx = 0;
        for (const b of barSubset) {
            const mNum = b.measureNumber;
            const mTime = b.time;
            const events = [];

            if (b.beats && b.beats.length > 0) {
                b.beats.forEach((beat, bIdx) => {
                    const notesTab = [];
                    (beat.notes || []).forEach(n => {
                        if (n) {
                            notesTab.push({
                                string: n.string,
                                fret: n.fret,
                                hopo: n.hopo || false,
                                bend: n.bend || null,
                                slide: n.slide || null,
                                vibrato: n.vibrato || false,
                                palmMute: n.palmMute || false
                            });
                        }
                    });

                    let assignedChord = beat.chord;
                    if (!assignedChord && bIdx === 0 && secChords.length > 0) {
                        assignedChord = secChords[chordIdx % secChords.length];
                        chordIdx++;
                    }

                    events.push({
                        layer_a_chord: assignedChord || null,
                        layer_b_tab: notesTab.length > 0 ? notesTab : null,
                        rhythm: beat.rhythm?.noteValue || "Quarter",
                        palmMute: beat.palmMute || false,
                        text: beat.text || null
                    });
                });
            } else {
                events.push({
                    layer_a_chord: secChords.length > 0 ? secChords[chordIdx % secChords.length] : null,
                    layer_b_tab: null,
                    rhythm: "Whole",
                    palmMute: false,
                    text: null
                });
                chordIdx++;
            }

            measuresList.push({
                measure_number: mNum,
                time_signature: mTime,
                events
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
        schema_version: "1.0.0",
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
        requires_agent_intervention: false
    };
}
