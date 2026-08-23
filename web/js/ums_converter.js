/**
 * Unified Music Schema (UMS) Converter
 * Translates Guitar Pro scores into the canonical UMS SongGraph format.
 */

export function convertToUms(score) {
    if (!score) return null;

    const primaryTrack = score.tracks[0] || { capo: 0, tuningNames: ["E2", "A2", "D3", "G3", "B3", "E4"] };
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
        b.beats.forEach(beat => {
            const notesTab = (beat.notes || []).map(n => ({
                string: n.string,
                fret: n.fret,
                hopo: n.hopo || false,
                bend: n.bend || null,
                slide: n.slide || null,
                vibrato: n.vibrato || false
            }));

            events.push({
                layer_a_chord: beat.chord || null,
                layer_b_tab: notesTab.length > 0 ? notesTab : null,
                rhythm: beat.rhythm?.noteValue || "Quarter",
                palm_mute: beat.palmMute || false,
                text: beat.text || null
            });
        });

        currentBlock.measures.push({
            measure_number: b.measureNumber,
            time_signature: b.time,
            events
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
        schema_version: "1.0.0",
        canonical: {
            title: canonicalTitle,
            artist: canonicalArtist,
            album: canonicalAlbum,
            genre: score.metadata?.genre || null,
            transcriber: canonicalTabber,
            copyright: canonicalCopyright,
            original_key: "Am",
            original_tempo_bpm: score.tempo,
            original_time_signature: score.getPrimaryTimeSignature ? score.getPrimaryTimeSignature() : (score.masterbars[0]?.time || "4/4"),
            original_tuning: primaryTrack.tuningNames.join(" "),
            original_capo: primaryTrack.capo,
            tags: ["guitar_pro", "tab", "human_readable"]
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
        requires_agent_intervention: false
    };
}
