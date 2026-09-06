/**
 * Client-Side Discrepancy & Conflict Detection Engine.
 * Isolates structural, harmonic, capo, and lyric disagreements between
 * Guitar Pro scores, PDF lead sheets, and vocal documents.
 */

export class Discrepancy {
    constructor({
        conflictId,
        conflictType,
        severity = "medium",
        measureNumber = 1,
        beatDivision = 1.0,
        sectionName = "Unknown",
        description = "",
        candidates = {},
        proposedResolution = null,
        musicalRationale = "",
        confidence = 0.8
    }) {
        this.conflictId = conflictId;
        this.conflictType = conflictType; // 'chord_mismatch', 'section_structure', 'capo_key_offset', 'lyric_alignment', 'meter_tempo'
        this.severity = severity;         // 'high', 'medium', 'low'
        this.measureNumber = measureNumber;
        this.beatDivision = beatDivision;
        this.sectionName = sectionName;
        this.description = description;
        this.candidates = candidates;
        this.proposedResolution = proposedResolution;
        this.musicalRationale = musicalRationale;
        this.confidence = confidence;
        this.userOverride = null;         // When user manually steers/edits
        this.isResolved = false;
    }

    getEffectiveResolution() {
        return this.userOverride !== null ? this.userOverride : this.proposedResolution;
    }

    toLogEntry() {
        return {
            conflict_id: this.conflictId,
            measure_number: this.measureNumber,
            beat_division: Math.round(this.beatDivision * 1000) / 1000,
            type: this.conflictType,
            gp_value: this.candidates.guitar_pro || null,
            pdf_value: this.candidates.chord_sheet_pdf || this.candidates.vocal_score_pdf || null,
            resolution: this.getEffectiveResolution(),
            musical_rationale: this.musicalRationale,
            confidence: this.confidence,
            is_user_steered: this.userOverride !== null
        };
    }
}

export function detectDiscrepancies(gpScore, chordDoc = null, vocalDoc = null) {
    if (!gpScore) return [];

    const discrepancies = [];
    let confCounter = 1;

    // 1. Global Metadata Discrepancies
    const gpMeta = gpScore.metadata || {};
    const gpTempo = gpScore.tempo || 120;
    const primaryTrack = gpScore.tracks?.[0] || {};
    const gpCapo = primaryTrack.capo || 0;

    const pdfMeta = chordDoc?.metadata || {};
    const pdfKey = pdfMeta.key || null;
    const pdfCapo = pdfMeta.capo !== undefined ? pdfMeta.capo : 0;
    const pdfTempo = pdfMeta.tempo_bpm || null;

    const vocalMeta = vocalDoc?.metadata || {};
    const vocalKey = vocalMeta.key || null;
    const vocalTempo = vocalMeta.tempo_bpm || null;

    // Key signature discrepancy across sources
    const keyCandidates = {};
    if (gpMeta.key) keyCandidates.guitar_pro = gpMeta.key;
    if (pdfKey) keyCandidates.chord_sheet_pdf = pdfKey;
    if (vocalKey) keyCandidates.vocal_score_pdf = vocalKey;

    const uniqueKeys = Array.from(new Set(Object.values(keyCandidates)));
    if (uniqueKeys.length > 1) {
        const isRelative = (uniqueKeys.includes("F#m") && uniqueKeys.includes("A")) ||
                           (uniqueKeys.includes("Em") && uniqueKeys.includes("G")) ||
                           (uniqueKeys.includes("Am") && uniqueKeys.includes("C")) ||
                           (uniqueKeys.includes("Bm") && uniqueKeys.includes("D"));
        discrepancies.push(new Discrepancy({
            conflictId: `conf_${confCounter++}`,
            conflictType: "capo_key_offset",
            severity: isRelative ? "low" : "medium",
            measureNumber: 1,
            beatDivision: 1.0,
            sectionName: "Global",
            description: isRelative
                ? `Key signature enharmonic/relative notation difference: Sources indicate ${uniqueKeys.join(" vs ")} (relative major/minor sharing the same key signature).`
                : `Key signature mismatch across sources: ${Object.entries(keyCandidates).map(([s, k]) => `${s}: ${k}`).join(", ")}.`,
            candidates: keyCandidates,
            proposedResolution: pdfKey || gpMeta.key || vocalKey,
            musicalRationale: isRelative
                ? `Relative major and minor keys share the identical key signature (e.g. F# minor and A major both have 3 sharps: F#, C#, G#). Selected tonic pitch center.`
                : "Lead sheet concert pitch prioritized for harmonic lead instruments.",
            confidence: 0.90
        }));
    }

    if (pdfCapo !== gpCapo && (pdfCapo > 0 || gpCapo > 0)) {
        discrepancies.push(new Discrepancy({
            conflictId: `conf_${confCounter++}`,
            conflictType: "capo_key_offset",
            severity: "high",
            measureNumber: 1,
            beatDivision: 1.0,
            sectionName: "Global",
            description: `Capo setting disagreement: GP has Capo ${gpCapo}, PDF lead sheet has Capo ${pdfCapo}.`,
            candidates: {
                guitar_pro: `Capo ${gpCapo}`,
                chord_sheet_pdf: `Capo ${pdfCapo}`
            },
            proposedResolution: gpCapo > 0 ? gpCapo : pdfCapo,
            musicalRationale: "Guitar Pro fret numbers are mathematically bound to its specific capo position.",
            confidence: 0.90
        }));
    }

    // Comprehensive Tempo & Metric Subdivision Conflict Detection
    const tempoCandidates = {
        guitar_pro: `${gpTempo} BPM`
    };
    if (pdfTempo) tempoCandidates.chord_sheet_pdf = `${pdfTempo} BPM`;
    if (vocalTempo) tempoCandidates.vocal_score_pdf = `${vocalTempo} BPM`;

    const allTempos = [
        { src: "guitar_pro", bpm: gpTempo },
        ...(pdfTempo ? [{ src: "chord_sheet_pdf", bpm: pdfTempo }] : []),
        ...(vocalTempo ? [{ src: "vocal_score_pdf", bpm: vocalTempo }] : [])
    ];

    const distinctTempos = Array.from(new Set(allTempos.map(t => t.bpm))).filter(Boolean);
    const hasTempoConflict = distinctTempos.some(t => Math.abs(t - gpTempo) > 5);

    if (hasTempoConflict) {
        const isCutTime = distinctTempos.some(t1 => distinctTempos.some(t2 => Math.abs(t1 / t2 - 2.0) < 0.1 || Math.abs(t1 / t2 - 0.5) < 0.1));
        const highestBpm = Math.max(...distinctTempos);
        const lowestBpm = Math.min(...distinctTempos);

        discrepancies.push(new Discrepancy({
            conflictId: `conf_${confCounter++}`,
            conflictType: "meter_tempo",
            severity: isCutTime ? "high" : "medium",
            measureNumber: 1,
            beatDivision: 1.0,
            sectionName: "Global",
            description: isCutTime
                ? `Metric subdivision difference: Vocal score is notated in cut-time (${highestBpm} BPM), while Guitar Pro / Rhythm chart is notated at ${lowestBpm} BPM.`
                : `Tempo indication mismatch: Sources indicate ${distinctTempos.map(b => `${b} BPM`).join(" vs ")}.`,
            candidates: tempoCandidates,
            proposedResolution: `${gpTempo} BPM`,
            musicalRationale: isCutTime
                ? `Vocal score uses double-time metric feel (${highestBpm} BPM) with 2 measures per rhythm bar. Reconciling canonical timeline backbone to ${gpTempo} BPM with synchronized 2:1 metric mapping.`
                : `Quantized playback tempo (${gpTempo} BPM) selected for audio-synchronized timeline backbone.`,
            confidence: 0.92
        }));
    }

    // 2. Structural & Section Count Discrepancies
    const pdfSections = chordDoc?.structure || [];
    const trackBars = gpScore.getTrackBars ? gpScore.getTrackBars(0) : (gpScore.bars || []);
    const totalBars = trackBars.length;

    if (pdfSections.length > 0 && totalBars > 0) {
        const cleanSecs = pdfSections.filter(s => (s.lines?.length || 0) > 0 || (s.chords?.length || 0) > 0);
        const avgBarsPerSec = totalBars / (cleanSecs.length || 1);
        if (avgBarsPerSec < 2.0 || avgBarsPerSec > 30.0) {
            discrepancies.push(new Discrepancy({
                conflictId: `conf_${confCounter++}`,
                conflictType: "section_structure",
                severity: "medium",
                measureNumber: 1,
                beatDivision: 1.0,
                sectionName: "Full Song",
                description: `Section density irregularity: ${cleanSecs.length} sections mapped across ${totalBars} bars (~${Math.round(avgBarsPerSec * 10) / 10} bars/section).`,
                candidates: {
                    guitar_pro_bars: totalBars,
                    pdf_section_count: cleanSecs.length
                },
                proposedResolution: "proportional_boundary_clustering",
                musicalRationale: "Proportionally allocate bars weighted by line and chord counts per section.",
                confidence: 0.75
            }));
        }
    }

    // 3. Measure-by-Measure Chord & Extension Discrepancies
    const secChordsPool = [];
    if (pdfSections.length > 0) {
        pdfSections.forEach(s => {
            (s.lines || []).forEach(l => {
                (l.chord_events || []).forEach(ce => {
                    secChordsPool.push({
                        section: s.name || "Unknown",
                        chord: ce.chord
                    });
                });
            });
        });
    }

    let chordPoolIdx = 0;
    trackBars.forEach((bar, bIdx) => {
        const mNum = bar.measureNumber || (bIdx + 1);
        const gpBeats = bar.beats || [];

        gpBeats.forEach((beat, bSubIdx) => {
            const gpChord = beat.chord || null;
            const beatDiv = 1.0 + (bSubIdx * 1.0);

            if (bSubIdx === 0 && secChordsPool.length > 0) {
                const candidate = secChordsPool[chordPoolIdx % secChordsPool.length];
                const pdfChord = candidate.chord;
                const secName = candidate.section;
                chordPoolIdx++;

                if (gpChord && pdfChord && gpChord !== pdfChord) {
                    const isRichExtension = (
                        (pdfChord.includes("add") || pdfChord.includes("maj") || pdfChord.includes("sus") || pdfChord.includes("7") || pdfChord.includes("9") || pdfChord.includes("/")) &&
                        !(gpChord.includes("add") || gpChord.includes("maj") || gpChord.includes("sus") || gpChord.includes("7") || gpChord.includes("9"))
                    );

                    const rationale = isRichExtension
                        ? "Lead sheet contains richer harmonic extension; fretted tab supports voicing."
                        : "Harmonic disagreement between score tab voicing and lead sheet annotation.";

                    discrepancies.push(new Discrepancy({
                        conflictId: `conf_${confCounter++}`,
                        conflictType: "chord_mismatch",
                        severity: isRichExtension ? "medium" : "high",
                        measureNumber: mNum,
                        beatDivision: beatDiv,
                        sectionName: secName,
                        description: `Measure ${mNum}: GP chord is '${gpChord}', but PDF chord is '${pdfChord}'.`,
                        candidates: {
                            guitar_pro: gpChord,
                            chord_sheet_pdf: pdfChord
                        },
                        proposedResolution: pdfChord,
                        musicalRationale: rationale,
                        confidence: isRichExtension ? 0.92 : 0.78
                    }));
                }
            }
        });
    });

    return discrepancies;
}
