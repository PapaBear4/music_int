/**
 * Client-Side Context Manager for LLM Music Information Retrieval.
 * Assembles Macro Song Roadmaps (recurring progressions, section sequence)
 * and Micro Measure Context (local frets, syllables, surrounding measures)
 * into rich prompt payloads for OpenRouter and LLM providers.
 */

export function extractMacroSongContext(gpScore, chordDoc = null) {
    const meta = gpScore.metadata || {};
    const pdfMeta = chordDoc?.metadata || {};
    const primaryTrack = gpScore.tracks?.[0] || {};

    const pdfSections = chordDoc?.structure || [];
    const sectionSummaries = [];
    const sectionPatterns = {};

    pdfSections.forEach(s => {
        const sName = s.name || "Section";
        const chords = [];
        (s.lines || []).forEach(l => {
            (l.chord_events || []).forEach(ce => {
                chords.push(ce.chord);
            });
        });
        if (chords.length === 0 && s.chords) {
            chords.push(...s.chords);
        }

        const patternStr = chords.length > 0 ? chords.slice(0, 8).join(" -> ") : "Instrumental / Unspecified";
        sectionSummaries.push({
            section: sName,
            chord_count: chords.length,
            progression_preview: patternStr
        });

        const baseType = sName.split(" ")[0]; // e.g. 'Verse', 'Chorus'
        if (!sectionPatterns[baseType]) {
            sectionPatterns[baseType] = patternStr;
        }
    });

    return {
        title: pdfMeta.title || meta.title || "Untitled",
        artist: pdfMeta.artist || meta.artist || "Unknown Artist",
        original_key: pdfMeta.key || meta.key || "D",
        tempo_bpm: gpScore.tempo || pdfMeta.tempo_bpm || 120,
        capo: primaryTrack.capo || 0,
        tuning: (primaryTrack.tuningNames || ["E2", "A2", "D3", "G3", "B3", "E4"]).join(" "),
        section_map: sectionSummaries,
        recurring_progressions: sectionPatterns
    };
}

export function extractMicroMeasureNeighborhood(measureNumber, trackBars, pdfSections, windowSize = 2) {
    const startM = Math.max(1, measureNumber - windowSize);
    const endM = measureNumber + windowSize;

    const surroundingBars = [];
    (trackBars || []).forEach(b => {
        const mNum = b.measureNumber || 0;
        if (mNum >= startM && mNum <= endM) {
            const beatsInfo = (b.beats || []).map(beat => ({
                chord: beat.chord || null,
                lyrics: beat.lyrics || beat.text || null,
                fretted_notes: (beat.notes || []).map(n => `str_${n.string}:fret_${n.fret}`)
            }));

            surroundingBars.append ? surroundingBars.append({
                measure_number: mNum,
                is_target_measure: (mNum === measureNumber),
                beats: beatsInfo
            }) : surroundingBars.push({
                measure_number: mNum,
                is_target_measure: (mNum === measureNumber),
                beats: beatsInfo
            });
        }
    });

    return {
        window_range: `Bars ${startM} to ${endM}`,
        surrounding_measures: surroundingBars
    };
}

export function buildLlmReconciliationPrompt(discrepancies, macroContext, gpScore, chordDoc = null) {
    const trackBars = gpScore.getTrackBars ? gpScore.getTrackBars(0) : (gpScore.bars || []);
    const pdfSections = chordDoc?.structure || [];

    const conflictItems = (discrepancies || []).map(d => {
        const micro = extractMicroMeasureNeighborhood(d.measureNumber, trackBars, pdfSections, 2);
        return {
            conflict_id: d.conflictId,
            conflict_type: d.conflictType,
            severity: d.severity,
            measure_number: d.measureNumber,
            beat_division: d.beatDivision,
            section_name: d.sectionName,
            description: d.description,
            candidates: d.candidates,
            deterministic_proposal: d.proposedResolution,
            deterministic_rationale: d.musicalRationale,
            micro_neighborhood: micro
        };
    });

    const systemInstruction = `You are an expert musicologist, transcriptionist, and music theory AI.
Your task is to reconcile discrepancies between multiple music source files (Guitar Pro tablature, PDF chord sheets, and vocal scores) into a single canonical Unified Music Schema (UMS).

Guiding Principles:
1. Harmonic Continuity & Pattern Matching: Look at how recurring sections (Verses, Choruses) behave across the song. If Verse 1 and Verse 2 follow a specific progression, Verse 3 should follow the same pattern unless a deliberate modulation occurs.
2. Voicing Fidelity vs. Lead Extension: Guitar Pro contains exact fretted positions, whereas chord sheets contain simplified or extended chord names. Choose the chord representation that best captures the intended musical harmony while remaining faithful to the played notes.
3. Capo and Key Awareness: Understand the algebraic relation between capo-relative shapes (e.g. G shape) and concert pitch (e.g. A chord with Capo 2).
4. Transparency: Provide a clear, concise musical rationale explaining why you chose your resolution.`;

    const userPayload = {
        macro_song_context: macroContext,
        conflicts_to_reconcile: conflictItems,
        response_format_instructions: "Return a valid JSON object with a 'reconciled_decisions' array. Each item must have: 'conflict_id', 'resolved_value', 'musical_rationale', 'confidence_score' (0.0 to 1.0), and 'pattern_matched'."
    };

    return {
        systemInstruction,
        userPayload
    };
}
