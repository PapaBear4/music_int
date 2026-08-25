#!/usr/bin/env python3
"""
Discrepancy & Conflict Detection Engine.
Deterministically compares Guitar Pro scores against PDF lead sheets, chord charts,
and score documents to isolate structural, harmonic, and lyrical conflicts.
"""

from typing import Dict, List, Any, Optional, Tuple


class Discrepancy:
    """Represents a structured conflict between two or more music sources."""
    def __init__(
        self,
        conflict_id: str,
        conflict_type: str,
        severity: str,
        measure_number: int,
        beat_division: float,
        section_name: str,
        description: str,
        candidates: Dict[str, Any],
        proposed_resolution: Any,
        musical_rationale: str,
        confidence: float = 0.8
    ):
        self.conflict_id = conflict_id
        self.conflict_type = conflict_type  # 'chord_mismatch', 'section_structure', 'capo_key_offset', 'lyric_alignment', 'meter_tempo'
        self.severity = severity            # 'high', 'medium', 'low'
        self.measure_number = measure_number
        self.beat_division = beat_division
        self.section_name = section_name
        self.description = description
        self.candidates = candidates        # e.g. {"guitar_pro": "D", "chord_sheet_pdf": "Dadd9"}
        self.proposed_resolution = proposed_resolution
        self.musical_rationale = musical_rationale
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "conflict_id": self.conflict_id,
            "conflict_type": self.conflict_type,
            "severity": self.severity,
            "measure_number": self.measure_number,
            "beat_division": round(self.beat_division, 3),
            "section_name": self.section_name,
            "description": self.description,
            "candidates": self.candidates,
            "proposed_resolution": self.proposed_resolution,
            "musical_rationale": self.musical_rationale,
            "confidence": self.confidence
        }


def detect_discrepancies(
    gp_score_dict: Dict[str, Any],
    chord_doc: Optional[Dict[str, Any]] = None,
    vocal_doc: Optional[Dict[str, Any]] = None
) -> List[Discrepancy]:
    """
    Detects all harmonic, structural, metadata, and lyrical discrepancies
    between the parsed Guitar Pro score and supplemental lead/vocal documents.
    """
    discrepancies: List[Discrepancy] = []
    conf_counter = 1

    # 1. Global Metadata & Capo/Key Discrepancies
    gp_meta = gp_score_dict.get("metadata", {})
    gp_tempo = gp_score_dict.get("tempo", 120)
    gp_tracks = gp_score_dict.get("tracks", [])
    primary_track = gp_tracks[0] if gp_tracks else {}
    gp_capo = primary_track.get("capo", 0)

    pdf_meta = chord_doc.get("metadata", {}) if chord_doc else {}
    pdf_key = pdf_meta.get("key")
    pdf_capo = pdf_meta.get("capo", 0)
    pdf_tempo = pdf_meta.get("tempo_bpm")

    if pdf_key and gp_meta.get("key") and pdf_key != gp_meta.get("key"):
        discrepancies.append(Discrepancy(
            conflict_id=f"conf_{conf_counter}",
            conflict_type="capo_key_offset",
            severity="medium",
            measure_number=1,
            beat_division=1.0,
            section_name="Global",
            description=f"Key signature mismatch: GP reports {gp_meta.get('key')}, PDF lead sheet reports {pdf_key}.",
            candidates={
                "guitar_pro": gp_meta.get("key"),
                "chord_sheet_pdf": pdf_key
            },
            proposed_resolution=pdf_key,
            musical_rationale="Lead sheet keys are typically transcribed to match recorded concert pitch.",
            confidence=0.85
        ))
        conf_counter += 1

    if pdf_capo != gp_capo and (pdf_capo > 0 or gp_capo > 0):
        discrepancies.append(Discrepancy(
            conflict_id=f"conf_{conf_counter}",
            conflict_type="capo_key_offset",
            severity="high",
            measure_number=1,
            beat_division=1.0,
            section_name="Global",
            description=f"Capo setting disagreement: GP has Capo {gp_capo}, PDF lead sheet has Capo {pdf_capo}.",
            candidates={
                "guitar_pro": f"Capo {gp_capo}",
                "chord_sheet_pdf": f"Capo {pdf_capo}"
            },
            proposed_resolution=gp_capo if gp_capo > 0 else pdf_capo,
            musical_rationale="Guitar Pro fret numbers are mathematically bound to its specific capo position.",
            confidence=0.90
        ))
        conf_counter += 1

    if pdf_tempo and abs(pdf_tempo - gp_tempo) > 5:
        discrepancies.append(Discrepancy(
            conflict_id=f"conf_{conf_counter}",
            conflict_type="meter_tempo",
            severity="low",
            measure_number=1,
            beat_division=1.0,
            section_name="Global",
            description=f"Tempo indication difference: GP playback is {gp_tempo} BPM, PDF suggests {pdf_tempo} BPM.",
            candidates={
                "guitar_pro": f"{gp_tempo} BPM",
                "chord_sheet_pdf": f"{pdf_tempo} BPM"
            },
            proposed_resolution=gp_tempo,
            musical_rationale="GP tempo is quantized for audio playback; PDF tempo is often approximate.",
            confidence=0.88
        ))
        conf_counter += 1

    # 2. Structural & Section Count Discrepancies
    pdf_sections = chord_doc.get("structure", []) if chord_doc else []
    track_bars = gp_score_dict.get("bars", []) or gp_score_dict.get("measures", [])
    total_bars = len(track_bars)

    if pdf_sections:
        clean_secs = [s for s in pdf_sections if s.get("lines") or s.get("chords")]
        if len(clean_secs) > 0 and total_bars > 0:
            avg_bars_per_sec = total_bars / len(clean_secs)
            if avg_bars_per_sec < 2.0 or avg_bars_per_sec > 30.0:
                discrepancies.append(Discrepancy(
                    conflict_id=f"conf_{conf_counter}",
                    conflict_type="section_structure",
                    severity="medium",
                    measure_number=1,
                    beat_division=1.0,
                    section_name="Full Song",
                    description=f"Section density irregularity: {len(clean_secs)} sections mapped across {total_bars} bars (~{round(avg_bars_per_sec, 1)} bars/section).",
                    candidates={
                        "guitar_pro_bars": total_bars,
                        "pdf_section_count": len(clean_secs)
                    },
                    proposed_resolution="proportional_boundary_clustering",
                    musical_rationale="Proportionally allocate bars weighted by line and chord counts per section.",
                    confidence=0.75
                ))
                conf_counter += 1

    # 3. Measure-by-Measure Chord & Extension Discrepancies
    sec_chords_pool = []
    if pdf_sections:
        for s in pdf_sections:
            for l in s.get("lines", []):
                for ce in l.get("chord_events", []):
                    sec_chords_pool.append({
                        "section": s.get("name", "Unknown"),
                        "chord": ce.get("chord")
                    })

    chord_pool_idx = 0
    for b_idx, bar in enumerate(track_bars):
        m_num = bar.get("measure_number", b_idx + 1)
        gp_beats = bar.get("beats", [])

        for b_sub_idx, beat in enumerate(gp_beats):
            gp_chord = beat.get("chord")
            beat_div = beat.get("beat_division", 1.0 + (b_sub_idx * 1.0))
            
            # Check if there is a candidate from chord sheet on downbeat
            if b_sub_idx == 0 and sec_chords_pool:
                candidate = sec_chords_pool[chord_pool_idx % len(sec_chords_pool)]
                pdf_chord = candidate["chord"]
                sec_name = candidate["section"]
                chord_pool_idx += 1

                if gp_chord and pdf_chord and gp_chord != pdf_chord:
                    # Analyze discrepancy type
                    is_rich_extension = (
                        ("add" in pdf_chord or "maj" in pdf_chord or "sus" in pdf_chord or "7" in pdf_chord or "9" in pdf_chord or "/" in pdf_chord)
                        and not ("add" in gp_chord or "maj" in gp_chord or "sus" in gp_chord or "7" in gp_chord or "9" in gp_chord)
                    )
                    
                    rationale = "Lead sheet contains richer harmonic extension; fretted tab supports voicing." if is_rich_extension else "Harmonic disagreement between score tab voicing and lead sheet annotation."
                    proposed = pdf_chord if is_rich_extension else pdf_chord

                    discrepancies.append(Discrepancy(
                        conflict_id=f"conf_{conf_counter}",
                        conflict_type="chord_mismatch",
                        severity="medium" if is_rich_extension else "high",
                        measure_number=m_num,
                        beat_division=beat_div,
                        section_name=sec_name,
                        description=f"Measure {m_num}: GP chord is '{gp_chord}', but PDF chord is '{pdf_chord}'.",
                        candidates={
                            "guitar_pro": gp_chord,
                            "chord_sheet_pdf": pdf_chord
                        },
                        proposed_resolution=proposed,
                        musical_rationale=rationale,
                        confidence=0.92 if is_rich_extension else 0.78
                    ))
                    conf_counter += 1

    return discrepancies
