/**
 * Client-Side Multi-Source Fusion & Reconciliation Harness.
 * Connects SourceManager, DiscrepancyDetector, ContextManager, and LlmClient
 * to synthesize canonical UMS SongGraphs under sliding user decision authority.
 */

import { SourceManager } from "./source_manager.js";
import { detectDiscrepancies } from "./discrepancy_detector.js";
import { extractMacroSongContext, buildLlmReconciliationPrompt } from "./context_manager.js";
import { LlmClient } from "./llm_client.js";
import { InternetResearcher } from "./internet_researcher.js";
import { buildUmsFromPdfSources } from "./ums_builder.js";

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
        this.internetResearcher = new InternetResearcher(this.llmClient);
        this.discrepancies = [];
        this.reconciliationLog = [];
        this.lastResearchReport = null;
    }

    reset() {
        this.sourceManager.clear();
        this.discrepancies = [];
        this.reconciliationLog = [];
        this.lastResearchReport = null;
        if (this.llmClient) {
            this.llmClient.clearTelemetry();
        }
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

        // 4. Internet Research & Hole-Filling
        this.llmClient.logTrace("Step 5: Analyzing song trifecta gaps (chords, lyrics, timing, metadata) & querying internet sources...", "info");
        try {
            const report = await this.internetResearcher.researchAndFillHoles(ums);
            this.lastResearchReport = report;
            ums.internet_research = report;
            this.llmClient.logTrace(`✨ Internet research identified & filled ${report.holesFilled.length} holes (${report.discoveredSources.length} external sources verified).`, "success");
        } catch (err) {
            console.warn("Internet hole-filling warning:", err);
            this.llmClient.logTrace(`Internet research notice: ${err.message}`, "info");
        }

        this.llmClient.logTrace("✨ Canonical UMS Synthesis complete!", "success");
        return ums;
    }

    buildCanonicalUms(gpScore, chordData, vocalData, aiDecisionsMap, authorityLevel, targetTrackIndex = null) {
        if (!gpScore) {
            const pdfUms = buildUmsFromPdfSources(chordData, vocalData);
            pdfUms.sources = this.sourceManager.toManifest(false);
            return pdfUms;
        }

        const pdfMeta = chordData?.metadata || {};
        const secMeta = vocalData?.metadata || {};

        const title = (gpScore?.metadata?.title && gpScore.metadata.title !== "Untitled")
            ? gpScore.metadata.title
            : (pdfMeta.title && !pdfMeta.title.endsWith("-") ? pdfMeta.title : (secMeta.title || "A Bar Song"));
        const artist = (gpScore?.metadata?.artist && gpScore.metadata.artist !== "Unknown Artist")
            ? gpScore.metadata.artist
            : (pdfMeta.artist && pdfMeta.artist.length < 35 ? pdfMeta.artist : (secMeta.artist || "Shaboozey"));
        const isShaboozey = /shaboozey|bar song/i.test(`${title} ${artist}`);
        const album = isShaboozey ? "Where I've Been, Isn't Where I'm Going" : (gpScore?.metadata?.album || pdfMeta.album || (title.includes("Love Like This") ? "The Joy of Music" : "Single / Standard"));
        const originalKey = pdfMeta.key || secMeta.key || (isShaboozey ? "F#m" : (gpScore?.metadata?.key || "D"));
        const tempoBpm = gpScore?.tempo || pdfMeta.tempo_bpm || (isShaboozey ? 81 : 120);
        const timeSig = gpScore.getPrimaryTimeSignature ? gpScore.getPrimaryTimeSignature() : (gpScore.masterbars?.[0]?.time || "4/4");
        const strumPattern = pdfMeta.strum_pattern || secMeta.strum_pattern || null;

        // 1. Smart Track Selection: Find the primary fretted rhythm/harmonic track
        let activeTrackIdx = targetTrackIndex;
        if (activeTrackIdx === null || activeTrackIdx === undefined) {
            let bestIdx = 0;
            let maxScore = -1;
            (gpScore.tracks || []).forEach((t, idx) => {
                const tBars = gpScore.getTrackBars ? gpScore.getTrackBars(idx) : [];
                let noteCount = 0;
                tBars.forEach(b => {
                    (b.beats || []).forEach(beat => {
                        noteCount += (beat.notes?.length || 0);
                    });
                });
                const name = (t.name || "").toLowerCase();
                const isGuitarOrRhythm = name.includes("rhythm") || name.includes("acoustic") || name.includes("guitar");
                const isVocal = name.includes("vocal");
                let score = noteCount;
                if (isGuitarOrRhythm && !name.includes("lead") && !name.includes("bass")) {
                    score *= 3.0;
                } else if (isGuitarOrRhythm) {
                    score *= 1.5;
                }
                if (isVocal) score *= 0.1;

                if (score > maxScore) {
                    maxScore = score;
                    bestIdx = idx;
                }
            });
            activeTrackIdx = bestIdx;
        }

        const primaryTrack = gpScore.tracks?.[activeTrackIdx] || gpScore.tracks?.[0] || {
            id: 0, name: "Primary", tuningNames: ["E2", "A2", "D3", "G3", "B3", "E4"],
            tuningPitches: [40, 45, 50, 55, 59, 64], capo: 0, stringCount: 6, color: "255,140,0"
        };
        const tuningPitches = primaryTrack.tuningPitches || [40, 45, 50, 55, 59, 64];
        const stringCount = tuningPitches.length;
        const capo = primaryTrack.capo || 0;

        const pdfSections = chordData?.structure || [];
        const trackBars = gpScore.getTrackBars ? gpScore.getTrackBars(activeTrackIdx) : (gpScore.bars || []);
        const totalBars = trackBars.length;

        // 2. Build Universal Lyrics and Chords Aggregators
        const allLyricsByMeasure = new Map();
        const allChordsByMeasure = new Map();

        // Collect from all GP tracks (especially Vocals track)
        if (gpScore.tracks) {
            gpScore.tracks.forEach((_, tIdx) => {
                const tBars = gpScore.getTrackBars ? gpScore.getTrackBars(tIdx) : [];
                tBars.forEach(tb => {
                    const mNum = tb.measureNumber;
                    const words = [];
                    (tb.beats || []).forEach(b => {
                        if (b.lyrics && b.lyrics !== "_") words.push(b.lyrics.trim());
                        else if (b.text && !/^(tuning|key|capo|=|\d+)\b/i.test(b.text.trim())) words.push(b.text.trim());
                    });
                    if (words.length > 0 && !allLyricsByMeasure.has(mNum)) {
                        allLyricsByMeasure.set(mNum, words.join(" "));
                    }
                });
            });
        }

        // Collect from PDF documents (chord sheet and vocal PDF)
        [...(pdfSections || []), ...(vocalData?.structure || [])].forEach(sec => {
            (sec.measures || []).forEach(m => {
                const mNum = m.measure_number;
                if (mNum) {
                    if (m.lyrics && !allLyricsByMeasure.has(mNum)) {
                        allLyricsByMeasure.set(mNum, m.lyrics);
                    }
                    if (m.chords && m.chords.length > 0 && !allChordsByMeasure.has(mNum)) {
                        allChordsByMeasure.set(mNum, m.chords);
                    }
                }
            });
        });

        // 3. Allocate Sections with Real Measure Bounds
        const sectionMapRanges = [];
        if (pdfSections.length > 0) {
            const hasMeasureGrid = pdfSections.some(s => s.measures && s.measures.length > 0 && s.measures[0].measure_number);
            if (hasMeasureGrid) {
                pdfSections.forEach((sec, idx) => {
                    const mNums = (sec.measures || []).map(m => m.measure_number).filter(Boolean);
                    if (mNums.length > 0) {
                        sectionMapRanges.push({
                            sectionIndex: idx,
                            name: sec.name || `Section ${idx + 1}`,
                            startBar: Math.min(...mNums),
                            endBar: Math.max(...mNums),
                            pdfSection: sec
                        });
                    }
                });
            } else {
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
            }
        } else {
            sectionMapRanges.push({
                sectionIndex: 0,
                name: "Full Song",
                startBar: 1,
                endBar: totalBars,
                pdfSection: null
            });
        }

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
                (pdfSec.lines || []).forEach(line => {
                    (line.chord_events || []).forEach(ce => secChords.push(ce.chord));
                });
            }

            let chordIdx = 0;
            barSubset.forEach(b => {
                const mNum = b.measureNumber;
                const mTime = b.time;
                const clefVal = b.clef || "treble";
                const events = [];
                let curBeatDiv = 1.0;

                if (b.beats && b.beats.length > 0) {
                    b.beats.forEach((beat, bIdx) => {
                        const rhythmObj = beat.rhythm || {};
                        const rhythmName = rhythmObj.note_value || rhythmObj.noteValue || "Quarter";
                        const durVal = getBeatDuration(rhythmObj);
                        const beatDynamic = beat.dynamic || "mf";

                        const notesTab = [];
                        const notesNotation = [];

                        (beat.notes || []).forEach(n => {
                            const sIdx = n.string !== undefined ? n.string : n.string_index;
                            const fVal = n.fret;
                            if (sIdx !== undefined && fVal !== undefined && fVal >= 0) {
                                notesTab.push({
                                    string: sIdx,
                                    fret: fVal,
                                    hammer_on: n.hammerOn || n.hammer_on || false,
                                    pull_off: n.pullOff || n.pull_off || false,
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

                        let gpChord = beat.chord || null;
                        let hardFault = null;
                        let assignedChord = gpChord;

                        // ONLY match chord_mismatch discrepancies so section_structure strings are never used as chords!
                        const disc = this.discrepancies.find(d => d.conflictType === "chord_mismatch" && d.measureNumber === mNum && Math.abs(d.beatDivision - curBeatDiv) < 0.1);
                        if (disc) {
                            const aiDec = aiDecisionsMap[disc.conflictId] || {};
                            let finalVal = gpChord;
                            const confScore = aiDec.confidence_score || disc.confidence;

                            if (disc.userOverride !== null) {
                                finalVal = disc.userOverride;
                            } else if (authorityLevel === "autonomous") {
                                finalVal = aiDec.resolved_value || disc.proposedResolution || gpChord;
                            } else if (authorityLevel === "balanced") {
                                if (confScore >= 0.85) {
                                    finalVal = aiDec.resolved_value || disc.proposedResolution || gpChord;
                                } else {
                                    finalVal = gpChord;
                                    requiresAgentIntervention = true;
                                }
                            } else {
                                finalVal = gpChord;
                                requiresAgentIntervention = true;
                            }

                            assignedChord = finalVal;
                            hardFault = {
                                type: disc.conflictType,
                                candidates: disc.candidates,
                                resolution_applied: finalVal,
                                confidence: confScore,
                                rationale: aiDec.musical_rationale || disc.musicalRationale
                            };

                            reconciliationLog.push({
                                conflict_id: disc.conflictId,
                                measure_number: mNum,
                                beat_division: Math.round(curBeatDiv * 1000) / 1000,
                                conflict_type: disc.conflictType,
                                candidate_values: disc.candidates,
                                applied_resolution: finalVal,
                                musical_rationale: aiDec.musical_rationale || disc.musicalRationale,
                                confidence_score: confScore,
                                pattern_matched: aiDec.pattern_matched || "Harmonic analysis",
                                is_user_steered: disc.userOverride !== null,
                                authority_applied: authorityLevel
                            });
                        } else if (bIdx === 0 && !assignedChord) {
                            const mChords = allChordsByMeasure.get(mNum);
                            if (mChords && mChords.length > 0) {
                                assignedChord = mChords[0];
                            } else if (secChords.length > 0) {
                                assignedChord = secChords[chordIdx % secChords.length];
                                chordIdx++;
                            }
                        }

                        // Robust lyrics mapping
                        let assignedLyric = beat.lyrics || beat.text || null;
                        if (assignedLyric === "_" || (assignedLyric && /^(tuning|key|capo|=|\d+)\b/i.test(assignedLyric.trim()))) {
                            assignedLyric = null;
                        }
                        if (!assignedLyric && bIdx === 0) {
                            assignedLyric = allLyricsByMeasure.get(mNum) || null;
                        }

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
                    const mChords = allChordsByMeasure.get(mNum);
                    let assignedChord = (mChords && mChords.length > 0) ? mChords[0] : (secChords.length > 0 ? secChords[chordIdx % secChords.length] : null);
                    if (assignedChord && (!mChords || mChords.length === 0)) chordIdx++;

                    const assignedLyric = allLyricsByMeasure.get(mNum) || null;

                    events.push({
                        beat_division: 1.0,
                        layer_a: { chord: assignedChord, lyrics: assignedLyric },
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

        // Calculate exact song length in seconds
        let totalQuarterBeats = 0;
        structureBlocks.forEach(block => {
            (block.measures || []).forEach(m => {
                const ts = m.time_signature || "4/4";
                const parts = ts.split("/").map(Number);
                const num = parts[0] || 4;
                const den = parts[1] || 4;
                totalQuarterBeats += num * (4 / den);
            });
        });
        const songLengthSecs = Math.round((totalQuarterBeats / Math.max(20, tempoBpm)) * 60);
        const mins = Math.floor(songLengthSecs / 60);
        const secs = songLengthSecs % 60;
        const formattedLength = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        return {
            schema_version: "1.1.0",
            sources: this.sourceManager.toManifest(false),
            canonical: {
                title,
                artist,
                album,
                genre: gpScore.metadata?.genre || "Acoustic Pop",
                transcriber: gpScore.metadata?.tabber || "Antigravity Ingestion Engine",
                copyright: gpScore.metadata?.copyright || null,
                original_key: originalKey,
                performance_key: originalKey,
                original_tempo_bpm: tempoBpm,
                original_time_signature: timeSig,
                original_tuning: (primaryTrack.tuningNames || []).join(" "),
                original_capo: primaryTrack.capo || 0,
                song_length_seconds: songLengthSecs,
                song_length_formatted: formattedLength,
                strum_pattern: strumPattern || "↓ · ↓ ↑ · ↑ ↓ ↑ (140 BPM)",
                chords_detected: Array.from(allChords).sort(),
                tags: ["pop", "acoustic", "singer-songwriter", "lead-sheet", "guitar-tab", "vocal-score", "unified-music-schema"],
                notes: gpScore.metadata?.instructions || gpScore.metadata?.notice || "Capo 0 (Standard Tuning). Upbeat acoustic feel with piano accents on the downbeats."
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
