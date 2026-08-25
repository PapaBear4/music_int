/**
 * Client-Side Multi-Source Fusion & Reconciliation Harness.
 * Connects SourceManager, DiscrepancyDetector, ContextManager, and LlmClient
 * to synthesize canonical UMS SongGraphs under sliding user decision authority.
 */

import { SourceManager } from "./source_manager.js";
import { detectDiscrepancies } from "./discrepancy_detector.js";
import { extractMacroSongContext, buildLlmReconciliationPrompt } from "./context_manager.js";
import { LlmClient } from "./llm_client.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midiPitch) {
    if (midiPitch < 0 || midiPitch > 127) return `?(${midiPitch})`;
    const name = NOTE_NAMES[midiPitch % 12];
    const octave = Math.floor(midiPitch / 12) - 1;
    return `${name}${octave}`;
}

const DURATIONS = {
    Whole: 4.0, Half: 2.0, Quarter: 1.0, Eighth: 0.5,
    "16th": 0.25, Sixteenth: 0.25, "32nd": 0.125, ThirtySecond: 0.125,
    "64th": 0.0625, SixtyFourth: 0.0625
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

export class FusionHarness {
    constructor() {
        this.sourceManager = new SourceManager();
        this.llmClient = new LlmClient();
        this.discrepancies = [];
        this.reconciliationLog = [];
    }

    async fuseMultiSource({ gpScore, chordDoc = null, vocalDoc = null, userSteerings = {} }) {
        this.llmClient.logTrace("Step 1: Ingesting source ASTs and establishing timeline backbone...", "info");

        // 1. Detect Discrepancies
        this.discrepancies = detectDiscrepancies(gpScore, chordDoc, vocalDoc);
        this.llmClient.logTrace(`Step 2: Conflict detection identified ${this.discrepancies.length} discrepancies across sources.`, this.discrepancies.length > 0 ? "warning" : "info");

        // Apply any manual user steerings
        Object.keys(userSteerings).forEach(confId => {
            const disc = this.discrepancies.find(d => d.conflictId === confId);
            if (disc) {
                disc.userOverride = userSteerings[confId];
                disc.isResolved = true;
                this.llmClient.logTrace(`Applied User Steering on ${confId}: '${userSteerings[confId]}'`, "success");
            }
        });

        // 2. Context Assembly & LLM Arbitration
        const aiDecisionsMap = {};
        const unresolvedDiscrepancies = this.discrepancies.filter(d => d.userOverride === null);

        if (unresolvedDiscrepancies.length > 0) {
            this.llmClient.logTrace("Step 3: Assembling Macro and Micro Context for LLM...", "info");
            const macroCtx = extractMacroSongContext(gpScore, chordDoc);
            const promptPayload = buildLlmReconciliationPrompt(unresolvedDiscrepancies, macroCtx, gpScore, chordDoc);

            const llmResp = await this.llmClient.reconcileConflicts(
                promptPayload.systemInstruction,
                promptPayload.userPayload
            );

            (llmResp.reconciled_decisions || []).forEach(dec => {
                aiDecisionsMap[dec.conflict_id] = dec;
                const matchDisc = this.discrepancies.find(d => d.conflictId === dec.conflict_id);
                if (matchDisc) {
                    matchDisc.proposedResolution = dec.resolved_value;
                    matchDisc.musicalRationale = dec.musical_rationale;
                    matchDisc.confidence = dec.confidence_score || matchDisc.confidence;
                }
            });
        }

        // 3. Build Canonical UMS under Selected Authority
        const authorityLevel = this.llmClient.authorityLevel;
        this.llmClient.logTrace(`Step 4: Compiling canonical UMS under '${authorityLevel.toUpperCase()}' decision authority...`, "info");

        const ums = this.buildCanonicalUms(gpScore, chordDoc, vocalDoc, aiDecisionsMap, authorityLevel);
        this.llmClient.logTrace("✨ Canonical UMS Synthesis complete!", "success");
        return ums;
    }

    buildCanonicalUms(gpScore, chordData, vocalData, aiDecisionsMap, authorityLevel) {
        const pdfMeta = chordData?.metadata || {};
        const secMeta = vocalData?.metadata || {};

        const title = pdfMeta.title || secMeta.title || gpScore.metadata?.title || "Untitled";
        const artist = pdfMeta.artist || secMeta.artist || gpScore.metadata?.artist || "Unknown Artist";
        const album = gpScore.metadata?.album || null;
        const originalKey = pdfMeta.key || secMeta.key || "D";
        const tempoBpm = gpScore.tempo || pdfMeta.tempo_bpm || 120;
        const timeSig = gpScore.getPrimaryTimeSignature ? gpScore.getPrimaryTimeSignature() : (gpScore.masterbars?.[0]?.time || "4/4");
        const strumPattern = pdfMeta.strum_pattern || secMeta.strum_pattern || null;

        const primaryTrack = gpScore.tracks?.[0] || {
            id: 0, name: "Primary", tuningNames: ["E2", "A2", "D3", "G3", "B3", "E4"],
            tuningPitches: [40, 45, 50, 55, 59, 64], capo: 0, stringCount: 6, color: "255,140,0"
        };
        const tuningPitches = primaryTrack.tuningPitches || [40, 45, 50, 55, 59, 64];
        const stringCount = tuningPitches.length;
        const capo = primaryTrack.capo || 0;

        const pdfSections = chordData?.structure || [];
        const trackBars = gpScore.getTrackBars ? gpScore.getTrackBars(0) : (gpScore.bars || []);
        const totalBars = trackBars.length;

        // Allocate sections
        const sectionMapRanges = [];
        if (pdfSections.length > 0) {
            const cleanSecs = pdfSections.filter(s => (s.lines?.length || 0) > 0 || (s.chords?.length || 0) > 0);
            const activeSecs = cleanSecs.length > 0 ? cleanSecs : pdfSections;
            const weights = activeSecs.map(s => Math.max((s.lines?.length || 0) * 2, s.chords?.length || 0, 1));
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

        // Map conflicts by position
        const conflictByPos = new Map();
        this.discrepancies.forEach(d => {
            const key = `${d.measureNumber}_${Math.round(d.beatDivision * 100) / 100}`;
            conflictByPos.set(key, d);
        });

        const reconciliationLog = [];
        const structureBlocks = [];
        let requiresAgentIntervention = false;

        sectionMapRanges.forEach(sRange => {
            const sName = sRange.name;
            const startB = sRange.startBar;
            const endB = sRange.endBar;
            const pdfSec = sRange.pdfSection;

            const measuresList = [];
            const barSubset = trackBars.filter(b => b.measureNumber >= startB && b.measureNumber <= endB);

            const secChords = [];
            if (pdfSec) {
                (pdfSec.lines || []).forEach(l => {
                    (l.chord_events || []).forEach(ce => secChords.push(ce.chord));
                });
            }

            let chordIdx = 0;
            barSubset.forEach(b => {
                const mNum = b.measureNumber;
                const mTime = b.time;
                const clefVal = b.clef || "treble";
                const events = [];
                let curBeatDiv = 1.0;

                const gpBeats = b.beats || [];
                if (gpBeats.length > 0) {
                    gpBeats.forEach((beat, bIdx) => {
                        const rhythmObj = beat.rhythm || {};
                        const rhythmName = rhythmObj.note_value || rhythmObj.noteValue || "Quarter";
                        const durVal = getBeatDuration(rhythmObj);
                        const beatDynamic = beat.dynamic || "mf";

                        // Layer B & C
                        const notesTab = [];
                        const notesNotation = [];
                        (beat.notes || []).forEach(n => {
                            if (n) {
                                const sIdx = n.string !== undefined ? n.string : 0;
                                const fVal = n.fret !== undefined ? n.fret : 0;
                                notesTab.push({
                                    string: sIdx, fret: fVal, hopo: n.hopo || false,
                                    bend: n.bend || null, slide: n.slide || null,
                                    vibrato: n.vibrato || false, palm_mute: n.palmMute || n.palm_mute || false
                                });
                                const tIdx = stringCount - 1 - sIdx;
                                const openPitch = (tIdx >= 0 && tIdx < stringCount) ? tuningPitches[tIdx] : 64;
                                const midiPitch = openPitch + fVal + capo;
                                notesNotation.push({
                                    pitch: midiToNoteName(midiPitch),
                                    midi_pitch: midiPitch,
                                    duration: rhythmName,
                                    dynamics: beatDynamic
                                });
                            }
                        });

                        // Layer A & Discrepancies
                        let assignedChord = beat.chord || null;
                        let hardFault = null;
                        const posKey = `${mNum}_${Math.round(curBeatDiv * 100) / 100}`;

                        if (conflictByPos.has(posKey)) {
                            const disc = conflictByPos.get(posKey);
                            const aiDec = aiDecisionsMap[disc.conflictId] || {};
                            const resolvedVal = disc.userOverride || aiDec.resolved_value || disc.proposedResolution;
                            const rationale = aiDec.musical_rationale || disc.musicalRationale;
                            const confScore = aiDec.confidence_score || disc.confidence;

                            if (disc.userOverride === null) {
                                if (authorityLevel === "advisory") {
                                    requiresAgentIntervention = true;
                                    hardFault = {
                                        conflict_id: disc.conflictId,
                                        type: disc.conflictType,
                                        proposed: resolvedVal,
                                        rationale,
                                        status: "awaiting_user_approval"
                                    };
                                } else if (authorityLevel === "balanced" && confScore < 0.85) {
                                    requiresAgentIntervention = true;
                                    hardFault = {
                                        conflict_id: disc.conflictId,
                                        type: disc.conflictType,
                                        proposed: resolvedVal,
                                        rationale,
                                        status: "low_confidence_review_required"
                                    };
                                    assignedChord = resolvedVal;
                                } else {
                                    assignedChord = resolvedVal;
                                }
                            } else {
                                assignedChord = resolvedVal;
                            }

                            reconciliationLog.push({
                                conflict_id: disc.conflictId,
                                measure_number: mNum,
                                beat_division: Math.round(curBeatDiv * 1000) / 1000,
                                type: disc.conflictType,
                                gp_value: disc.candidates.guitar_pro,
                                pdf_value: disc.candidates.chord_sheet_pdf,
                                resolved_value: resolvedVal,
                                musical_rationale: rationale,
                                confidence_score: confScore,
                                pattern_matched: aiDec.pattern_matched || "Harmonic analysis",
                                is_user_steered: disc.userOverride !== null,
                                authority_applied: authorityLevel
                            });
                        } else if (bIdx === 0 && secChords.length > 0 && !assignedChord) {
                            assignedChord = secChords[chordIdx % secChords.length];
                            chordIdx++;
                        }

                        let assignedLyric = beat.lyrics || beat.text || null;
                        if (assignedLyric === "_") assignedLyric = null;

                        events.push({
                            beat_division: Math.round(curBeatDiv * 1000) / 1000,
                            layer_a: { chord: assignedChord, lyrics: assignedLyric },
                            layer_b: { tab_positions: notesTab, rhythm: rhythmName },
                            layer_c: { clef: clefVal, notes: notesNotation },
                            hard_fault: hardFault
                        });
                        curBeatDiv += durVal;
                    });
                } else {
                    let assignedChord = secChords.length > 0 ? secChords[chordIdx % secChords.length] : null;
                    if (assignedChord) chordIdx++;

                    events.push({
                        beat_division: 1.0,
                        layer_a: { chord: assignedChord, lyrics: null },
                        layer_b: { tab_positions: [], rhythm: "Whole" },
                        layer_c: { clef: clefVal, notes: [] },
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
            });

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
        });

        const allChords = new Set([
            ...(pdfMeta.chords_detected || []),
            ...(secMeta.chords_detected || []),
            ...(gpScore.getAllChords ? gpScore.getAllChords() : [])
        ]);

        return {
            schema_version: "1.1.0",
            sources: this.sourceManager.toManifest(false),
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
                original_tuning: (primaryTrack.tuningNames || []).join(" "),
                original_capo: primaryTrack.capo || 0,
                strum_pattern: strumPattern,
                chords_detected: Array.from(allChords).sort(),
                tags: ["guitar_pro", "pdf_ocr", "unified_music_schema", "cadence", "llm_reconciled"]
            },
            tracks: (gpScore.tracks || []).map(t => ({
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
            telemetry_traces: this.llmClient.telemetryHistory,
            requires_agent_intervention: requiresAgentIntervention
        };
    }
}
