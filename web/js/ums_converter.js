/**
 * Unified Music Schema (UMS) Converter
 * Translates Guitar Pro scores into the canonical UMS SongGraph format with complete tri-layer structure.
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

export function convertToUms(score) {
    if (!score) return null;

    const primaryTrack = score.tracks[0] || {
        capo: 0,
        tuningNames: ["E2", "A2", "D3", "G3", "B3", "E4"],
        tuningPitches: [40, 45, 50, 55, 59, 64]
    };
    const tuningPitches = primaryTrack.tuningPitches || [40, 45, 50, 55, 59, 64];
    const stringCount = tuningPitches.length;
    const capo = primaryTrack.capo || 0;

    const structureBlocks = [];

    let currentBlock = {
        block_name: "Score",
        sectionId: "section_0",
        sectionLabel: "Intro",
        measures: []
    };

    const bars = score.getTrackBars(0);
    bars.forEach(b => {
        if (b.section) {
            if (currentBlock.measures.length > 0) {
                structureBlocks.push(currentBlock);
            }
            const secName = b.section.name;
            currentBlock = {
                block_name: secName,
                sectionId: `sec_${structureBlocks.length}`,
                sectionLabel: secName,
                section_overrides: {
                    tempo_bpm: score.tempo,
                    time_signature: b.time
                },
                measures: []
            };
        }

        const events = [];
        let curBeatDivision = 1.0;
        const clefVal = b.clef || "treble";

        b.beats.forEach(beat => {
            const rhythmObj = beat.rhythm || {};
            const rhythmName = rhythmObj.note_value || rhythmObj.noteValue || "Quarter";
            const durVal = getBeatDuration(rhythmObj);
            const beatDynamic = beat.dynamic || "mf";

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

            let lyricVal = beat.lyrics || beat.text || null;
            if (lyricVal === "_") lyricVal = null;

            events.push({
                beat_division: Math.round(curBeatDivision * 1000) / 1000,
                layer_a: {
                    chord: beat.chord || null,
                    lyrics: lyricVal
                },
                layer_b: {
                    tab_positions: notesTab,
                    rhythm: rhythmName
                },
                layer_c: {
                    clef: clefVal,
                    notes: notesNotation
                },
                hard_fault: null
            });

            curBeatDivision += durVal;
        });

        currentBlock.measures.push({
            measure_index: b.measureNumber,
            measure_number: b.measureNumber,
            time_signature: b.time,
            events,
            musical_events: events
        });
    });

    if (currentBlock.measures.length > 0) {
        structureBlocks.push(currentBlock);
    }

    const canonicalTitle = score.metadata?.title || score.metadata?.subTitle || score.metadata?.name || score.title || "Untitled";
    const canonicalArtist = score.metadata?.artist || score.metadata?.music || score.metadata?.words || score.metadata?.author || score.metadata?.composer || score.metadata?.band || score.artist || "Unknown";
    const canonicalAlbum = score.metadata?.album || score.metadata?.collection || score.album || null;
    const canonicalTabber = score.metadata?.tabber || score.metadata?.transcriber || null;
    const canonicalCopyright = score.metadata?.copyright || null;

    return {
        schema_version: "1.1.0",
        canonical: {
            title: canonicalTitle,
            artist: canonicalArtist,
            album: canonicalAlbum,
            genre: score.metadata?.genre || null,
            transcriber: canonicalTabber,
            copyright: canonicalCopyright,
            original_key: score.metadata?.key || "D",
            original_tempo_bpm: score.tempo,
            original_time_signature: score.getPrimaryTimeSignature ? score.getPrimaryTimeSignature() : (score.masterbars[0]?.time || "4/4"),
            original_tuning: primaryTrack.tuningNames.join(" "),
            original_capo: primaryTrack.capo,
            tags: ["guitar_pro", "tab", "unified_music_schema"]
        },
        tracks: score.tracks.map(t => ({
            id: t.id,
            name: t.name,
            tuning: t.tuningNames,
            tuning_pitches: t.tuningPitches,
            capo: t.capo,
            string_count: t.stringCount,
            color: t.color
        })),
        structure: structureBlocks,
        reconciliation_log: [],
        requires_agent_intervention: false
    };
}
