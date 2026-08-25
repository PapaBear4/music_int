#!/usr/bin/env python3
"""
Multi-Source Fusion & Reconciliation Harness.
Orchestrates deterministic extraction, context synthesis, LLM arbitration,
and sliding decision authority into a canonical Unified Music Schema (UMS) SongGraph.
"""

import os
import json
from typing import Dict, List, Any, Optional, Callable

from source_manager import SourceManager, SourceDocument
from discrepancy_detector import detect_discrepancies, Discrepancy
from context_manager import extract_macro_song_context, build_llm_reconciliation_prompt
from llm_client import LlmClient
from gp_reader import GuitarProScore, midi_to_note_name
import pdf_extractor


DURATIONS = {
    "Whole": 4.0, "Half": 2.0, "Quarter": 1.0, "Eighth": 0.5,
    "16th": 0.25, "Sixteenth": 0.25, "32nd": 0.125, "ThirtySecond": 0.125,
    "64th": 0.0625, "SixtyFourth": 0.0625
}


def get_beat_duration(rhythm: Dict[str, Any]) -> float:
    if not rhythm:
        return 1.0
    note_val = rhythm.get("note_value") or rhythm.get("noteValue") or "Quarter"
    base = DURATIONS.get(note_val, 1.0)
    dots = rhythm.get("dots", 0)
    if dots == 1:
        base *= 1.5
    elif dots == 2:
        base *= 1.75
    tuplet = rhythm.get("tuplet")
    if tuplet and len(tuplet) == 2 and tuplet[0] > 0:
        base *= (tuplet[1] / tuplet[0])
    return base


class FusionHarness:
    """
    Unified Ingestion & Arbitration Harness with Sliding Decision Authority.
    """
    def __init__(
        self,
        llm_client: Optional[LlmClient] = None,
        authority_level: str = "balanced"  # 'advisory', 'balanced', 'autonomous'
    ):
        self.source_manager = SourceManager()
        self.llm_client = llm_client or LlmClient()
        self.authority_level = authority_level.lower()
        self.discrepancies: List[Discrepancy] = []
        self.reconciliation_log: List[Dict[str, Any]] = []

    def ingest_and_fuse(
        self,
        gp_file: str,
        chord_file: Optional[str] = None,
        vocal_file: Optional[str] = None,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Executes end-to-end multi-source fusion.
        """
        if on_progress:
            on_progress("Stage 1: Registering sources and extracting ASTs...")

        # 1. Register Sources
        gp_score = GuitarProScore.from_file(gp_file)
        gp_doc = self.source_manager.add_source_from_file(gp_file, parsed_ast=gp_score.to_dict(), role_override="primary_rhythm")

        chord_doc = None
        if chord_file and os.path.exists(chord_file):
            c_data = pdf_extractor.parse_music_pdf(chord_file)
            chord_doc = self.source_manager.add_source_from_file(chord_file, parsed_ast=c_data, role_override="harmonic_lead")

        vocal_doc = None
        if vocal_file and os.path.exists(vocal_file):
            v_data = pdf_extractor.parse_music_pdf(vocal_file)
            vocal_doc = self.source_manager.add_source_from_file(vocal_file, parsed_ast=v_data, role_override="vocal_melody")

        # 2. Stage 2: Discrepancy Detection
        if on_progress:
            on_progress("Stage 2: Deterministic rhythmic anchoring & conflict detection...")

        raw_c_data = chord_doc.parsed_ast if chord_doc else None
        raw_v_data = vocal_doc.parsed_ast if vocal_doc else None
        self.discrepancies = detect_discrepancies(gp_score.to_dict(), raw_c_data, raw_v_data)

        if on_progress:
            on_progress(f"Detected {len(self.discrepancies)} cross-source discrepancies.")

        # 3. Stage 3: Context Assembly & LLM Arbitration
        ai_decisions_map = {}
        if self.discrepancies:
            if on_progress:
                on_progress("Stage 3: Assembling Macro + Micro context for LLM Arbitration...")

            macro_ctx = extract_macro_song_context(gp_score.to_dict(), raw_c_data)
            prompt_payload = build_llm_reconciliation_prompt(
                self.discrepancies,
                macro_ctx,
                gp_score.to_dict(),
                raw_c_data
            )

            llm_resp = self.llm_client.reconcile_conflicts(
                prompt_payload["system_instruction"],
                prompt_payload["user_payload"],
                on_progress=on_progress
            )

            for dec in llm_resp.get("reconciled_decisions", []):
                ai_decisions_map[dec.get("conflict_id")] = dec

        # 4. Stage 4: Apply Sliding Authority & Build Canonical UMS
        if on_progress:
            on_progress(f"Stage 4: Synthesizing canonical UMS under '{self.authority_level.upper()}' authority...")

        return self._build_canonical_ums(gp_score, raw_c_data, raw_v_data, ai_decisions_map)

    def _build_canonical_ums(
        self,
        gp_score: GuitarProScore,
        chord_data: Optional[Dict[str, Any]],
        vocal_data: Optional[Dict[str, Any]],
        ai_decisions_map: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Synthesizes final tri-layer UMS with audited decisions."""
        pdf_meta = chord_data.get("metadata", {}) if chord_data else {}
        sec_meta = vocal_data.get("metadata", {}) if vocal_data else {}

        title = pdf_meta.get("title") or sec_meta.get("title") or gp_score.metadata.get("title") or "Untitled"
        artist = pdf_meta.get("artist") or sec_meta.get("artist") or gp_score.metadata.get("artist") or "Unknown Artist"
        album = gp_score.metadata.get("album") or None
        original_key = pdf_meta.get("key") or sec_meta.get("key") or "D"
        tempo_bpm = gp_score.tempo or pdf_meta.get("tempo_bpm") or 120
        time_sig = gp_score.primary_time_signature
        strum_pattern = pdf_meta.get("strum_pattern") or sec_meta.get("strum_pattern") or None

        primary_track = gp_score.tracks[0] if gp_score.tracks else {
            "id": 0, "name": "Primary", "tuning_names": ["E2", "A2", "D3", "G3", "B3", "E4"],
            "tuning_pitches": [40, 45, 50, 55, 59, 64], "capo": 0, "string_count": 6, "color": "255,140,0"
        }
        tuning_pitches = primary_track.get("tuning_pitches", [40, 45, 50, 55, 59, 64])
        string_count = len(tuning_pitches)
        capo = primary_track.get("capo", 0)

        pdf_sections = chord_data.get("structure", []) if chord_data else []
        track_bars = gp_score.get_track_bars(0) if gp_score.tracks else []
        total_bars = len(track_bars)

        # Section boundaries
        section_map_ranges = []
        if pdf_sections:
            clean_secs = [s for s in pdf_sections if s.get("lines") or s.get("chords")] or pdf_sections
            weights = [max(len(s.get("lines", [])) * 2, len(s.get("chords", [])), 1) for s in clean_secs]
            total_w = sum(weights) or 1
            cur_bar = 1

            for s_idx, (sec, w) in enumerate(zip(clean_secs, weights)):
                if s_idx == len(clean_secs) - 1:
                    bars_for_sec = max(1, total_bars - cur_bar + 1)
                else:
                    bars_for_sec = max(2, round((w / total_w) * total_bars))
                    if cur_bar + bars_for_sec - 1 >= total_bars:
                        bars_for_sec = max(1, total_bars - cur_bar)

                start_bar = cur_bar
                end_bar = min(cur_bar + bars_for_sec - 1, total_bars)
                section_map_ranges.append({
                    "section_index": s_idx,
                    "name": sec["name"],
                    "start_bar": start_bar,
                    "end_bar": end_bar,
                    "pdf_section": sec
                })
                cur_bar = end_bar + 1
        else:
            section_map_ranges.append({
                "section_index": 0,
                "name": "Full Song",
                "start_bar": 1,
                "end_bar": total_bars,
                "pdf_section": None
            })

        # Process discrepancies and map by (measure, beat)
        conflict_by_pos = {}
        for d in self.discrepancies:
            key = (d.measure_number, round(d.beat_division, 2))
            conflict_by_pos[key] = d

        reconciliation_log = []
        structure_blocks = []
        requires_agent_intervention = False

        for s_range in section_map_ranges:
            s_name = s_range["name"]
            start_b = s_range["start_bar"]
            end_b = s_range["end_bar"]
            pdf_sec = s_range["pdf_section"]

            measures_list = []
            bar_subset = [b for b in track_bars if start_b <= b["measure_number"] <= end_b]

            sec_chords = []
            if pdf_sec:
                for line in pdf_sec.get("lines", []):
                    for ce in line.get("chord_events", []):
                        sec_chords.append(ce["chord"])

            chord_idx = 0
            for b in bar_subset:
                m_num = b["measure_number"]
                m_time = b["time"]
                clef_val = b.get("clef", "treble")
                events = []
                cur_beat_div = 1.0

                gp_beats = b.get("beats", [])
                if gp_beats:
                    for b_idx, beat in enumerate(gp_beats):
                        rhythm_obj = beat.get("rhythm", {})
                        rhythm_name = rhythm_obj.get("note_value", "Quarter")
                        dur_val = get_beat_duration(rhythm_obj)
                        beat_dynamic = beat.get("dynamic") or "mf"

                        # Layer B (Tab) & Layer C (Notation)
                        notes_tab = []
                        notes_notation = []
                        for n in beat.get("notes", []):
                            if n:
                                s_idx = n.get("string", 0)
                                f_val = n.get("fret", 0)
                                notes_tab.append({
                                    "string": s_idx,
                                    "fret": f_val,
                                    "hopo": n.get("hopo", False),
                                    "bend": n.get("bend"),
                                    "slide": n.get("slide"),
                                    "vibrato": n.get("vibrato", False),
                                    "palm_mute": n.get("palm_mute", False)
                                })
                                t_idx = string_count - 1 - s_idx
                                open_pitch = tuning_pitches[t_idx] if 0 <= t_idx < len(tuning_pitches) else 64
                                midi_pitch = open_pitch + f_val + capo
                                notes_notation.append({
                                    "pitch": midi_to_note_name(midi_pitch),
                                    "midi_pitch": midi_pitch,
                                    "duration": rhythm_name,
                                    "dynamics": beat_dynamic
                                })

                        # Layer A (Chords) & Discrepancy Resolution
                        assigned_chord = beat.get("chord")
                        hard_fault = None
                        pos_key = (m_num, round(cur_beat_div, 2))

                        if pos_key in conflict_by_pos:
                            disc = conflict_by_pos[pos_key]
                            ai_dec = ai_decisions_map.get(disc.conflict_id, {})
                            resolved_val = ai_dec.get("resolved_value") or disc.proposed_resolution
                            rationale = ai_dec.get("musical_rationale") or disc.musical_rationale
                            conf_score = ai_dec.get("confidence_score", disc.confidence)

                            # Authority Check
                            if self.authority_level == "advisory":
                                requires_agent_intervention = True
                                hard_fault = {
                                    "conflict_id": disc.conflict_id,
                                    "type": disc.conflict_type,
                                    "proposed": resolved_val,
                                    "rationale": rationale,
                                    "status": "awaiting_user_approval"
                                }
                            elif self.authority_level == "balanced" and conf_score < 0.85:
                                requires_agent_intervention = True
                                hard_fault = {
                                    "conflict_id": disc.conflict_id,
                                    "type": disc.conflict_type,
                                    "proposed": resolved_val,
                                    "rationale": rationale,
                                    "status": "low_confidence_review_required"
                                }
                                assigned_chord = resolved_val
                            else:
                                assigned_chord = resolved_val

                            reconciliation_log.append({
                                "conflict_id": disc.conflict_id,
                                "measure_number": m_num,
                                "beat_division": round(cur_beat_div, 3),
                                "type": disc.conflict_type,
                                "gp_value": disc.candidates.get("guitar_pro"),
                                "pdf_value": disc.candidates.get("chord_sheet_pdf"),
                                "resolved_value": resolved_val,
                                "musical_rationale": rationale,
                                "confidence_score": conf_score,
                                "pattern_matched": ai_dec.get("pattern_matched", "Heuristic alignment"),
                                "authority_applied": self.authority_level
                            })
                        elif b_idx == 0 and sec_chords and not assigned_chord:
                            assigned_chord = sec_chords[chord_idx % len(sec_chords)]
                            chord_idx += 1

                        assigned_lyric = beat.get("lyrics") or beat.get("text") or None
                        if assigned_lyric == "_":
                            assigned_lyric = None

                        events.append({
                            "beat_division": round(cur_beat_div, 3),
                            "layer_a": {"chord": assigned_chord, "lyrics": assigned_lyric},
                            "layer_b": {"tab_positions": notes_tab, "rhythm": rhythm_name},
                            "layer_c": {"clef": clef_val, "notes": notes_notation},
                            "hard_fault": hard_fault
                        })
                        cur_beat_div += dur_val
                else:
                    assigned_chord = sec_chords[chord_idx % len(sec_chords)] if sec_chords else None
                    if assigned_chord:
                        chord_idx += 1
                    events.append({
                        "beat_division": 1.0,
                        "layer_a": {"chord": assigned_chord, "lyrics": None},
                        "layer_b": {"tab_positions": [], "rhythm": "Whole"},
                        "layer_c": {"clef": clef_val, "notes": []},
                        "hard_fault": None
                    })

                measures_list.append({
                    "measure_index": m_num,
                    "measure_number": m_num,
                    "time_signature": m_time,
                    "events": events,
                    "musical_events": events
                })

            structure_blocks.append({
                "block_name": s_name,
                "sectionId": f"sec_{s_range['section_index']}",
                "sectionLabel": s_name,
                "section_overrides": {
                    "tempo_bpm": tempo_bpm,
                    "time_signature": measures_list[0]["time_signature"] if measures_list else time_sig,
                    "has_pickup": (start_b == 1 and gp_score.has_pickup_measure),
                    "strum_pattern": strum_pattern
                },
                "measures": measures_list
            })

        all_detected_chords = list(set(
            (pdf_meta.get("chords_detected") or []) +
            (sec_meta.get("chords_detected") or []) +
            gp_score.get_all_chords()
        ))

        return {
            "schema_version": "1.1.0",
            "sources": self.source_manager.to_manifest(include_raw=False),
            "canonical": {
                "title": title,
                "artist": artist,
                "album": album,
                "genre": gp_score.metadata.get("genre"),
                "transcriber": gp_score.metadata.get("tabber") or "Antigravity Multi-Source Ingestion Engine",
                "copyright": gp_score.metadata.get("copyright"),
                "original_key": original_key,
                "original_tempo_bpm": tempo_bpm,
                "original_time_signature": time_sig,
                "original_tuning": " ".join(primary_track["tuning_names"]),
                "original_capo": primary_track["capo"],
                "strum_pattern": strum_pattern,
                "chords_detected": sorted(all_detected_chords),
                "tags": ["guitar_pro", "pdf_ocr", "unified_music_schema", "cadence", "llm_reconciled"]
            },
            "tracks": gp_score.tracks,
            "structure": structure_blocks,
            "reconciliation_log": reconciliation_log,
            "telemetry_traces": [t.to_dict() for t in self.llm_client.telemetry_history],
            "requires_agent_intervention": requires_agent_intervention
        }
