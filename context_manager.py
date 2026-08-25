#!/usr/bin/env python3
"""
Context Manager for LLM Music Information Retrieval & Reconciliation.
Synthesizes Macro Song Roadmaps (recurring progressions, section maps)
and Micro Measure Context (local frets, syllables, surrounding bars)
into rich prompt payloads for the LLM.
"""

from typing import Dict, List, Any, Optional
from discrepancy_detector import Discrepancy


def extract_macro_song_context(
    gp_score_dict: Dict[str, Any],
    chord_doc: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Extracts high-level song architecture: global key/meter/capo,
    section hierarchy, and recurring harmonic patterns across sections.
    """
    meta = gp_score_dict.get("metadata", {})
    pdf_meta = chord_doc.get("metadata", {}) if chord_doc else {}
    tracks = gp_score_dict.get("tracks", [])
    primary_track = tracks[0] if tracks else {}

    # Extract section outlines from PDF or GP
    pdf_sections = chord_doc.get("structure", []) if chord_doc else []
    section_summaries = []
    section_patterns = {}

    for s in pdf_sections:
        s_name = s.get("name", "Section")
        chords = []
        for l in s.get("lines", []):
            for ce in l.get("chord_events", []):
                chords.append(ce.get("chord"))
        if not chords and s.get("chords"):
            chords = s.get("chords", [])
        
        pattern_str = " -> ".join(chords[:8]) if chords else "Instrumental / Unspecified"
        section_summaries.append({
            "section": s_name,
            "chord_count": len(chords),
            "progression_preview": pattern_str
        })
        base_type = s_name.split()[0] # e.g. 'Verse', 'Chorus'
        if base_type not in section_patterns:
            section_patterns[base_type] = pattern_str

    return {
        "title": pdf_meta.get("title") or meta.get("title") or "Untitled",
        "artist": pdf_meta.get("artist") or meta.get("artist") or "Unknown Artist",
        "original_key": pdf_meta.get("key") or meta.get("key") or "D",
        "tempo_bpm": gp_score_dict.get("tempo") or pdf_meta.get("tempo_bpm") or 120,
        "capo": primary_track.get("capo", 0),
        "tuning": " ".join(primary_track.get("tuning_names", ["E2", "A2", "D3", "G3", "B3", "E4"])),
        "section_map": section_summaries,
        "recurring_progressions": section_patterns
    }


def extract_micro_measure_neighborhood(
    measure_number: int,
    track_bars: List[Dict[str, Any]],
    pdf_sections: List[Dict[str, Any]],
    window_size: int = 2
) -> Dict[str, Any]:
    """
    Extracts surrounding measure details (notes, chords, lyrics)
    centered around the target measure.
    """
    start_m = max(1, measure_number - window_size)
    end_m = measure_number + window_size

    surrounding_bars = []
    for b in track_bars:
        m_num = b.get("measure_number", 0)
        if start_m <= m_num <= end_m:
            beats_info = []
            for beat in b.get("beats", []):
                beats_info.append({
                    "chord": beat.get("chord"),
                    "lyrics": beat.get("lyrics") or beat.get("text"),
                    "fretted_notes": [
                        f"str_{n.get('string')}:fret_{n.get('fret')}" for n in beat.get("notes", []) if n
                    ]
                })
            surrounding_bars.append({
                "measure_number": m_num,
                "is_target_measure": (m_num == measure_number),
                "beats": beats_info
            })

    return {
        "window_range": f"Bars {start_m} to {end_m}",
        "surrounding_measures": surrounding_bars
    }


def build_llm_reconciliation_prompt(
    discrepancies: List[Discrepancy],
    macro_context: Dict[str, Any],
    gp_score_dict: Dict[str, Any],
    chord_doc: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Builds a complete, context-rich prompt payload for the LLM
    containing song architecture, recurring patterns, and conflict micro-neighborhoods.
    """
    track_bars = gp_score_dict.get("bars", []) or gp_score_dict.get("measures", [])
    pdf_sections = chord_doc.get("structure", []) if chord_doc else []

    conflict_items = []
    for d in discrepancies:
        micro = extract_micro_measure_neighborhood(d.measure_number, track_bars, pdf_sections, window_size=2)
        conflict_items.append({
            "conflict_id": d.conflict_id,
            "conflict_type": d.conflict_type,
            "severity": d.severity,
            "measure_number": d.measure_number,
            "beat_division": d.beat_division,
            "section_name": d.section_name,
            "description": d.description,
            "candidates": d.candidates,
            "deterministic_proposal": d.proposed_resolution,
            "deterministic_rationale": d.musical_rationale,
            "micro_neighborhood": micro
        })

    system_instruction = (
        "You are an expert musicologist, transcriptionist, and music theory AI. "
        "Your task is to reconcile discrepancies between multiple music source files "
        "(Guitar Pro tablature, PDF chord sheets, and vocal scores) into a single canonical Unified Music Schema (UMS).\n\n"
        "Guiding Principles:\n"
        "1. Harmonic Continuity & Pattern Matching: Look at how recurring sections (Verses, Choruses) behave across the song. "
        "If Verse 1 and Verse 2 follow a specific progression, Verse 3 should follow the same pattern unless a deliberate modulation occurs.\n"
        "2. Voicing Fidelity vs. Lead Extension: Guitar Pro contains exact fretted positions, whereas chord sheets contain simplified or extended chord names. "
        "Choose the chord representation that best captures the intended musical harmony while remaining faithful to the played notes.\n"
        "3. Capo and Key Awareness: Understand the algebraic relation between capo-relative shapes (e.g. G shape) and concert pitch (e.g. A chord with Capo 2).\n"
        "4. Transparency: Provide a clear, concise musical rationale explaining why you chose your resolution."
    )

    user_payload = {
        "macro_song_context": macro_context,
        "conflicts_to_reconcile": conflict_items,
        "response_format_instructions": (
            "Return a valid JSON object with a 'reconciled_decisions' array. Each item must have: "
            "'conflict_id', 'resolved_value', 'musical_rationale', 'confidence_score' (0.0 to 1.0), and 'pattern_matched'."
        )
    }

    return {
        "system_instruction": system_instruction,
        "user_payload": user_payload
    }
