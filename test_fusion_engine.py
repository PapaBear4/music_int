#!/usr/bin/env python3
"""
Automated Test Suite for Multi-Source Ingestion, Discrepancy Detection,
Context Management, and Sliding Authority UMS Fusion Engine.
"""

import os
import sys
import json

from source_manager import SourceManager
from discrepancy_detector import detect_discrepancies
from context_manager import extract_macro_song_context, extract_micro_measure_neighborhood, build_llm_reconciliation_prompt
from llm_client import LlmClient
from fusion_harness import FusionHarness
from gp_reader import GuitarProScore
import pdf_extractor


def run_tests():
    print("================================================================")
    print("   RUNNING MULTI-SOURCE INGESTION & FUSION TEST SUITE")
    print("================================================================")

    gp_path = "Ben Rector-Love Like This-08-07-2026.gp"
    chords_pdf_path = "love like this by ben rector chords.pdf"
    vocals_pdf_path = "love like this by ben rector vocals.pdf"

    if not os.path.exists(gp_path):
        print(f"ERROR: {gp_path} not found.")
        sys.exit(1)

    # -------------------------------------------------------------
    # Test 1: SourceManager Registration & Hashing
    # -------------------------------------------------------------
    print("\n--- Test 1: SourceManager Registration & Hashing ---")
    sm = SourceManager()
    with open(gp_path, "rb") as f:
        gp_doc = sm.add_source(os.path.basename(gp_path), f.read(), role_override="primary_rhythm")
    
    assert gp_doc.sha256 is not None, "SHA-256 should be computed"
    assert gp_doc.file_type == "guitar_pro", f"Expected guitar_pro, got {gp_doc.file_type}"
    assert gp_doc.role == "primary_rhythm", "Expected role primary_rhythm"
    print(f"✅ Registered {gp_doc.filename} (SHA-256: {gp_doc.sha256[:16]}... Size: {gp_doc.size_bytes} bytes)")

    if os.path.exists(chords_pdf_path):
        with open(chords_pdf_path, "rb") as f:
            c_doc = sm.add_source(os.path.basename(chords_pdf_path), f.read(), role_override="harmonic_lead")
        assert c_doc.file_type == "chord_sheet_pdf", f"Expected chord_sheet_pdf, got {c_doc.file_type}"
        print(f"✅ Registered {c_doc.filename} (Role: {c_doc.role})")

    manifest = sm.to_manifest()
    assert len(manifest) >= 1, "Manifest should have registered sources"
    print(f"✅ Manifest successfully compiled ({len(manifest)} sources).")

    # -------------------------------------------------------------
    # Test 2: Discrepancy Detection Engine (with simulated conflict score)
    # -------------------------------------------------------------
    print("\n--- Test 2: Discrepancy Detection Engine ---")
    gp_score = GuitarProScore.from_file(gp_path)
    c_data = pdf_extractor.parse_music_pdf(chords_pdf_path) if os.path.exists(chords_pdf_path) else None
    v_data = pdf_extractor.parse_music_pdf(vocals_pdf_path) if os.path.exists(vocals_pdf_path) else None
    # Inject explicit test discrepancies for verification
    synthetic_gp_score = gp_score.to_dict()
    if synthetic_gp_score["bars"] and synthetic_gp_score["bars"][0]["beats"]:
        # Set GP chord to "C" while PDF has "D" to test chord mismatch
        synthetic_gp_score["bars"][0]["beats"][0]["chord"] = "C"

    discrepancies = detect_discrepancies(synthetic_gp_score, c_data, v_data)
    assert len(discrepancies) > 0, "Should detect at least 1 discrepancy with mismatched chord"
    print(f"✅ Detected {len(discrepancies)} discrepancies across sources.")
    for d in discrepancies[:3]:
        print(f"   • [{d.severity.upper()}] {d.conflict_id} at Bar {d.measure_number} Beat {d.beat_division}: {d.description}")

    # -------------------------------------------------------------
    # Test 3: Context Manager & Prompt Formatter
    # -------------------------------------------------------------
    print("\n--- Test 3: Context Manager (Macro + Micro Pattern Extraction) ---")
    macro_ctx = extract_macro_song_context(synthetic_gp_score, c_data)
    assert macro_ctx["title"] is not None, "Title should be extracted"
    assert "section_map" in macro_ctx, "Section map should be in macro context"
    print(f"✅ Macro Context: Title='{macro_ctx['title']}', Key={macro_ctx['original_key']}, Tempo={macro_ctx['tempo_bpm']} BPM")
    print(f"   Sections detected: {len(macro_ctx['section_map'])}")

    prompt_payload = build_llm_reconciliation_prompt(discrepancies, macro_ctx, synthetic_gp_score, c_data)
    assert "system_instruction" in prompt_payload, "Prompt should have system instruction"
    assert len(prompt_payload["user_payload"]["conflicts_to_reconcile"]) == len(discrepancies), "All conflicts included in prompt"
    print(f"✅ Prompt Payload built successfully ({len(prompt_payload['user_payload']['conflicts_to_reconcile'])} micro-neighborhoods formatted).")

    # -------------------------------------------------------------
    # Test 4: LLM Client & Cognitive Simulator
    # -------------------------------------------------------------
    print("\n--- Test 4: Universal LLM Client & Musicology Simulator ---")
    client = LlmClient()
    llm_resp = client.reconcile_conflicts(
        prompt_payload["system_instruction"],
        prompt_payload["user_payload"]
    )
    decisions = llm_resp.get("reconciled_decisions", [])
    assert len(decisions) == len(discrepancies), "Should return decisions for all conflicts"
    print(f"✅ Simulated LLM Arbitration generated {len(decisions)} decisions with musical rationale.")
    for dec in decisions:
        print(f"   • {dec['conflict_id']} -> Resolved: '{dec['resolved_value']}' (Confidence: {dec['confidence_score']})")
        print(f"     Rationale: {dec['musical_rationale']}")

    # -------------------------------------------------------------
    # Test 5: Sliding Authority Modes (Advisory, Balanced, Autonomous)
    # -------------------------------------------------------------
    print("\n--- Test 5: Sliding Authority Dial Execution ---")
    
    # Mode A: Advisory (Requires user review)
    harness_advisory = FusionHarness(authority_level="advisory")
    ums_advisory = harness_advisory.ingest_and_fuse(gp_file=gp_path, chord_file=chords_pdf_path)
    print(f"✅ [Advisory Mode] Requires Agent Intervention: {ums_advisory['requires_agent_intervention']}")

    # Mode B: Autonomous (Auto-applies with complete audit log)
    harness_auto = FusionHarness(authority_level="autonomous")
    ums_auto = harness_auto.ingest_and_fuse(gp_file=gp_path, chord_file=chords_pdf_path)
    print(f"✅ [Autonomous Mode] Requires Agent Intervention: {ums_auto['requires_agent_intervention']}")
    print(f"✅ Total Reconciliation Log Entries: {len(ums_auto['reconciliation_log'])}")
    # -------------------------------------------------------------
    # Test 6: Shaboozey Sample Files Ingestion & Measure-Grid UMS Synthesis
    # -------------------------------------------------------------
    print("\n--- Test 6: Shaboozey Sample Files Ingestion & Measure-Grid UMS Synthesis ---")
    shaboozey_pdf = "music_src/A Bar Song Tab by Shaboozey - Rhythm Guitar.pdf"
    shaboozey_gp = "music_src/Shaboozey-A Bar Song-08-23-2026.gp"
    if os.path.exists(shaboozey_pdf):
        s_pdf_data = pdf_extractor.parse_music_pdf(shaboozey_pdf)
        assert s_pdf_data["metadata"]["title"] == "A Bar Song", f"Expected 'A Bar Song', got {s_pdf_data['metadata']['title']}"
        assert s_pdf_data["metadata"]["artist"] == "Shaboozey", f"Expected 'Shaboozey', got {s_pdf_data['metadata']['artist']}"
        assert s_pdf_data["metadata"]["key"] in ["F#m", "A"], f"Expected F#m or A, got {s_pdf_data['metadata']['key']}"
        assert len(s_pdf_data["structure"]) >= 5, f"Expected at least 5 sections, got {len(s_pdf_data['structure'])}"
        print(f"✅ Shaboozey PDF parsed: Title='{s_pdf_data['metadata']['title']}', Artist='{s_pdf_data['metadata']['artist']}', Key={s_pdf_data['metadata']['key']}, Sections={len(s_pdf_data['structure'])}")

        import ums_builder
        # Test PDF-only synthesis
        ums_pdf_only = ums_builder.build_ums_from_pdf_sources(s_pdf_data)
        assert ums_pdf_only["canonical"]["title"] == "A Bar Song"
        total_m = sum(len(b["measures"]) for b in ums_pdf_only["structure"])
        assert total_m == 58, f"Expected 58 bars, got {total_m}"
        print(f"✅ Shaboozey PDF-Only UMS Synthesized: {total_m} bars, {len(ums_pdf_only['canonical']['chords_detected'])} chords detected")

        # Test GP + PDF fusion
        if os.path.exists(shaboozey_gp):
            s_gp = GuitarProScore.from_file(shaboozey_gp)
            ums_fused = ums_builder.build_complete_ums(s_gp, s_pdf_data)
            assert ums_fused is not None
            fused_bars = sum(len(b["measures"]) for b in ums_fused["structure"])
            assert fused_bars == 58
            measures_with_lyrics = sum(1 for b in ums_fused["structure"] for m in b["measures"] for ev in m["musical_events"] if ev["layer_a"].get("lyrics"))
            assert measures_with_lyrics > 30, f"Expected >30 bars with lyrics, got {measures_with_lyrics}"
            print(f"✅ Shaboozey GP + PDF Fused UMS: {fused_bars} bars, {measures_with_lyrics} bars with lyrics aligned!")

    print("\n================================================================")
    print("   ALL TESTS PASSED SUCCESSFULLY! 🎯")
    print("================================================================")


if __name__ == "__main__":
    run_tests()
