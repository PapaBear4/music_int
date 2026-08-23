#!/usr/bin/env python3
"""
Unified Music Schema (UMS) Builder & Fusion Engine.
Synthesizes Guitar Pro scores (.gp / .gpif) with PDF chord sheets and score metadata
into the canonical UMS SongGraph data model.
"""

import json
from typing import Dict, List, Any, Optional

from gp_reader import GuitarProScore
import pdf_extractor


def build_complete_ums(
    gp_score: GuitarProScore,
    pdf_data: Optional[Dict[str, Any]] = None,
    secondary_pdf_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Fuses GuitarProScore with extracted PDF music data to build a complete canonical UMS SongGraph.
    """
    # 1. Resolve Canonical Metadata
    pdf_meta = pdf_data.get("metadata", {}) if pdf_data else {}
    sec_meta = secondary_pdf_data.get("metadata", {}) if secondary_pdf_data else {}

    title = (
        pdf_meta.get("title") or 
        sec_meta.get("title") or 
        gp_score.metadata.get("title") or 
        "Untitled"
    )
    artist = (
        pdf_meta.get("artist") or 
        sec_meta.get("artist") or 
        gp_score.metadata.get("artist") or 
        "Unknown Artist"
    )
    album = gp_score.metadata.get("album") or None
    original_key = pdf_meta.get("key") or sec_meta.get("key") or "Am"
    tempo_bpm = gp_score.tempo or pdf_meta.get("tempo_bpm") or 120
    time_sig = gp_score.primary_time_signature
    strum_pattern = pdf_meta.get("strum_pattern") or sec_meta.get("strum_pattern") or None

    primary_track = gp_score.tracks[0] if gp_score.tracks else {
        "id": 0, "name": "Primary", "tuning_names": ["E2", "A2", "D3", "G3", "B3", "E4"], "capo": 0, "string_count": 6, "color": "255,140,0"
    }

    # 2. Extract Sections & Milestones
    pdf_sections = pdf_data.get("structure", []) if pdf_data else []
    score_milestones = {}
    if pdf_data:
        score_milestones.update(pdf_data.get("milestones", {}))
    if secondary_pdf_data:
        score_milestones.update(secondary_pdf_data.get("milestones", {}))

    # 3. Build Measure Timeline & Events
    track_bars = gp_score.get_track_bars(0) if gp_score.tracks else []
    total_bars = len(track_bars)

    # Determine Section Boundaries across measures
    section_map_ranges = []
    if pdf_sections:
        # Filter clean sections with lines or chords
        clean_secs = [s for s in pdf_sections if s.get("lines") or s.get("chords")]
        if not clean_secs:
            clean_secs = pdf_sections

        # Compute weights based on lines and chords
        weights = []
        for s in clean_secs:
            num_lines = max(1, len(s.get("lines", [])))
            num_chords = max(1, len(s.get("chords", [])))
            w = max(num_lines * 2, num_chords)
            weights.append(w)

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
            if cur_bar > total_bars:
                break
    else:
        # Single default section
        section_map_ranges.append({
            "section_index": 0,
            "name": "Full Song",
            "start_bar": 1,
            "end_bar": total_bars,
            "pdf_section": None
        })

    # 4. Construct Structure Blocks
    structure_blocks = []
    for s_range in section_map_ranges:
        s_name = s_range["name"]
        start_b = s_range["start_bar"]
        end_b = s_range["end_bar"]
        pdf_sec = s_range["pdf_section"]

        measures_list = []
        bar_subset = [b for b in track_bars if start_b <= b["measure_number"] <= end_b]
        
        # Collect chords for this section from PDF
        sec_chords = []
        sec_lyrics = []
        if pdf_sec:
            for line in pdf_sec.get("lines", []):
                for ce in line.get("chord_events", []):
                    sec_chords.append(ce["chord"])
                if line.get("lyric_line"):
                    sec_lyrics.append(line.get("lyric_line"))

        chord_idx = 0
        for b in bar_subset:
            m_num = b["measure_number"]
            m_time = b["time"]
            events = []

            # Beats from GP
            gp_beats = b.get("beats", [])
            if gp_beats:
                for b_idx, beat in enumerate(gp_beats):
                    notes_tab = []
                    for n in beat.get("notes", []):
                        if n:
                            notes_tab.append({
                                "string": n.get("string", 0),
                                "fret": n.get("fret", 0),
                                "hopo": n.get("hopo", False),
                                "bend": n.get("bend"),
                                "slide": n.get("slide"),
                                "vibrato": n.get("vibrato", False),
                                "palm_mute": n.get("palm_mute", False)
                            })

                    # Assign chord to downbeat of measure if available
                    assigned_chord = beat.get("chord")
                    if not assigned_chord and b_idx == 0 and sec_chords:
                        assigned_chord = sec_chords[chord_idx % len(sec_chords)]
                        chord_idx += 1

                    events.append({
                        "layer_a_chord": assigned_chord,
                        "layer_b_tab": notes_tab if notes_tab else None,
                        "rhythm": beat.get("rhythm", {}).get("note_value", "Quarter"),
                        "palm_mute": beat.get("palm_mute", False),
                        "text": beat.get("text")
                    })
            else:
                # Empty measure fallback
                events.append({
                    "layer_a_chord": sec_chords[chord_idx % len(sec_chords)] if sec_chords else None,
                    "layer_b_tab": None,
                    "rhythm": "Whole",
                    "palm_mute": False,
                    "text": None
                })
                chord_idx += 1

            measures_list.append({
                "measure_number": m_num,
                "time_signature": m_time,
                "events": events
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

    # 5. Compile Final Canonical SongGraph
    all_detected_chords = list(set(
        (pdf_meta.get("chords_detected") or []) + 
        (sec_meta.get("chords_detected") or []) + 
        gp_score.get_all_chords()
    ))

    song_graph = {
        "schema_version": "1.0.0",
        "canonical": {
            "title": title,
            "artist": artist,
            "album": album,
            "genre": gp_score.metadata.get("genre"),
            "transcriber": gp_score.metadata.get("tabber") or "Antigravity Ingestion Engine",
            "copyright": gp_score.metadata.get("copyright"),
            "original_key": original_key,
            "original_tempo_bpm": tempo_bpm,
            "original_time_signature": time_sig,
            "original_tuning": " ".join(primary_track["tuning_names"]),
            "original_capo": primary_track["capo"],
            "strum_pattern": strum_pattern,
            "chords_detected": sorted(all_detected_chords),
            "tags": ["guitar_pro", "pdf_ocr", "unified_music_schema", "cadence"]
        },
        "tracks": gp_score.tracks,
        "structure": structure_blocks,
        "requires_agent_intervention": False
    }

    return song_graph
