#!/usr/bin/env python3
"""
Generalized PDF Music and Chord Ingestion Engine.
Extracts chords, lyrics, sections, key signatures, tunings, strumming patterns,
and measure checkpoints from chord sheets and score PDFs using OCR / PDF text parsing.
"""

import os
import re
import sys
import subprocess
import shutil
import tempfile
from typing import Dict, List, Any, Optional, Tuple

# Comprehensive chord regex: Roots A-G, accidentals #/b, qualities, extensions, slash bass notes
CHORD_REGEX = re.compile(
    r'(?<![A-Za-z0-9#])([A-G][#b]?(?:maj|min|m|dim|aug|sus[24]?|add[9]?|[0-9]+|M[0-9]*)*(?:/[A-G][#b]?)?)(?![A-Za-z0-9#])'
)

# Common section headers in chord and lead sheets
SECTION_HEADER_REGEX = re.compile(
    r'^\s*\[?(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]?\s*$',
    re.IGNORECASE
)

# Inline section bracket pattern (e.g., "[Verse 1]" anywhere on a line)
INLINE_SECTION_REGEX = re.compile(
    r'\[(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]',
    re.IGNORECASE
)


def extract_text_from_pdf(pdf_path: str, use_ocr: bool = True) -> str:
    """
    Extracts raw text from a PDF.
    First attempts native text layer extraction via pdftotext.
    If output is empty or sparse, runs optical OCR (pdftoppm + tesseract).
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    text = ""
    if shutil.which("pdftotext"):
        try:
            res = subprocess.run(["pdftotext", pdf_path, "-"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                text = res.stdout
        except Exception:
            pass

    # If text is substantial (> 100 non-whitespace chars), return immediately
    if len(re.sub(r'\s+', '', text)) > 100:
        return text

    # Otherwise, fallback to OCR if enabled and pdftoppm + tesseract are installed
    if use_ocr and shutil.which("pdftoppm") and shutil.which("tesseract"):
        with tempfile.TemporaryDirectory() as tmpdir:
            prefix = os.path.join(tmpdir, "page")
            subprocess.run(["pdftoppm", "-png", "-r", "150", pdf_path, prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            ocr_text_parts = []
            image_files = sorted([os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".png")])
            for img in image_files:
                res = subprocess.run(["tesseract", img, "stdout"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if res.returncode == 0:
                    ocr_text_parts.append(res.stdout)
            
            ocr_combined = "\n\n".join(ocr_text_parts)
            if len(re.sub(r'\s+', '', ocr_combined)) > len(re.sub(r'\s+', '', text)):
                return ocr_combined

    return text


def is_chord_line(line: str) -> bool:
    """Determines if a line primarily consists of chord names and spaces."""
    stripped = line.strip()
    if not stripped:
        return False
    if SECTION_HEADER_REGEX.match(stripped):
        return False

    tokens = stripped.split()
    chord_count = sum(1 for t in tokens if CHORD_REGEX.fullmatch(t))
    
    # If 50%+ of tokens are valid chords
    if len(tokens) > 0 and (chord_count / len(tokens)) >= 0.5:
        return True
    return False


def parse_metadata_header(text: str) -> Dict[str, Any]:
    """
    Extracts high-level song metadata from the text:
    Title, Artist, Key, Tuning, Capo, Tempo, Strumming Pattern.
    """
    meta: Dict[str, Any] = {
        "title": None,
        "artist": None,
        "key": None,
        "tuning": None,
        "capo": 0,
        "tempo_bpm": None,
        "strum_pattern": None,
        "chords_detected": []
    }

    lines = text.splitlines()
    for idx, line in enumerate(lines[:30]):  # Search top 30 lines
        line_clean = line.strip()
        
        # Title and Artist: e.g. "Love Like This Official by Ben Rector"
        by_match = re.match(r'^(.*?)\s+(?:Official\s+)?by\s+(.*)$', line_clean, re.IGNORECASE)
        if by_match and not meta["title"]:
            meta["title"] = by_match.group(1).replace("Official", "").strip()
            meta["artist"] = by_match.group(2).strip()

        # Key: e.g. "Key: D" or "Key : F#m"
        key_match = re.search(r'Key\s*:\s*([A-G][#b]?(?:m|maj|min)?)', line_clean, re.IGNORECASE)
        if key_match:
            meta["key"] = key_match.group(1).strip()

        # Tuning: e.g. "Tuning: EADGBE" or "Tuning: Eb Ab Db Gb Bb Eb"
        tuning_match = re.search(r'Tuning\s*:\s*([A-Ga-g\s#b]+)', line_clean, re.IGNORECASE)
        if tuning_match:
            meta["tuning"] = tuning_match.group(1).strip()

        # Capo: e.g. "Capo: 2nd fret" or "Capo: 0"
        capo_match = re.search(r'Capo\s*:\s*(\d+)', line_clean, re.IGNORECASE)
        if capo_match:
            meta["capo"] = int(capo_match.group(1))

        # Strumming / Tempo: e.g. "WHOLE SONG 140 bpm"
        bpm_match = re.search(r'(\d+)\s*bpm', line_clean, re.IGNORECASE)
        if bpm_match:
            meta["tempo_bpm"] = int(bpm_match.group(1))

        strum_match = re.search(r'STRUMMING PATTERN\s*(.*?)(?=\[|$)', "\n".join(lines[idx:idx+5]), re.IGNORECASE | re.DOTALL)
        if strum_match:
            pattern_text = strum_match.group(1).strip()
            pattern_lines = [pl.strip() for pl in pattern_text.splitlines() if pl.strip()]
            if pattern_lines:
                meta["strum_pattern"] = " ".join(pattern_lines)

    # Collect all unique chords in document
    all_chords = set(CHORD_REGEX.findall(text))
    false_positives = {"A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"}
    valid_chords = sorted([c for c in all_chords if (c not in false_positives or is_chord_line(c))])
    meta["chords_detected"] = valid_chords

    return meta


def parse_chord_sheet_structure(text: str) -> List[Dict[str, Any]]:
    """
    Parses a chord sheet into structured sections containing aligned chords and lyrics.
    """
    sections: List[Dict[str, Any]] = []
    current_section: Optional[Dict[str, Any]] = None

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check for section header
        sec_match = SECTION_HEADER_REGEX.match(stripped) or INLINE_SECTION_REGEX.search(stripped)
        if sec_match:
            sec_name = sec_match.group(1).strip()
            if current_section and (current_section["lines"] or current_section["chords"]):
                sections.append(current_section)
            current_section = {
                "name": sec_name,
                "lines": [],
                "chords": []
            }
            i += 1
            continue

        if current_section is None:
            # Check if this is the start of an untitled first section with chords
            if is_chord_line(line):
                current_section = {
                    "name": "Intro",
                    "lines": [],
                    "chords": []
                }
            else:
                # Still in header preamble, skip
                i += 1
                continue

        # Skip headers / metadata lines
        if any(keyword in stripped.lower() for keyword in ["tuning:", "key:", "strumming pattern", "bpm", "page "]):
            i += 1
            continue

        # Check for Chord Line above Lyric Line
        if is_chord_line(line):
            chord_line = line
            line_chords = CHORD_REGEX.findall(chord_line)
            current_section["chords"].extend(line_chords)

            # Check next line for lyrics
            next_line = lines[i + 1] if i + 1 < len(lines) else ""
            if next_line.strip() and not is_chord_line(next_line) and not SECTION_HEADER_REGEX.match(next_line.strip()):
                lyric_line = next_line
                i += 1  # consumed lyric line
            else:
                lyric_line = ""

            chord_events = []
            for match in CHORD_REGEX.finditer(chord_line):
                chord_events.append({
                    "chord": match.group(1),
                    "col": match.start()
                })

            # Build ChordPro representation
            if lyric_line:
                chordpro_parts = []
                last_idx = 0
                for ce in chord_events:
                    c_col = ce["col"]
                    if c_col < len(lyric_line):
                        chordpro_parts.append(lyric_line[last_idx:c_col])
                        chordpro_parts.append(f"[{ce['chord']}]")
                        last_idx = c_col
                    else:
                        if last_idx < len(lyric_line):
                            chordpro_parts.append(lyric_line[last_idx:])
                            last_idx = len(lyric_line)
                        chordpro_parts.append(f" [{ce['chord']}]")
                if last_idx < len(lyric_line):
                    chordpro_parts.append(lyric_line[last_idx:])
                chordpro_line = "".join(chordpro_parts)
            else:
                chordpro_line = " ".join([f"[{ce['chord']}]" for ce in chord_events])

            current_section["lines"].append({
                "chord_line": chord_line,
                "lyric_line": lyric_line,
                "chord_events": chord_events,
                "chordpro_line": chordpro_line
            })
        elif stripped and not is_chord_line(line):
            current_section["lines"].append({
                "chord_line": "",
                "lyric_line": stripped,
                "chord_events": [],
                "chordpro_line": stripped
            })

        i += 1

    if current_section["lines"] or current_section["chords"]:
        sections.append(current_section)

    return sections


def parse_score_pdf_milestones(text: str) -> Dict[str, int]:
    """
    Extracts measure checkpoints and section boundaries from score/vocal PDFs.
    """
    milestones: Dict[str, int] = {}
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        for sec in ["Intro", "Verse 1", "Verse 2", "Verse 3", "Chorus", "Bridge", "Interlude", "Outro"]:
            if sec.lower() in line.lower():
                surrounding = " ".join(lines[max(0, idx-2):min(len(lines), idx+4)])
                numbers = [int(n) for n in re.findall(r'\b(\d+)\b', surrounding) if 1 <= int(n) <= 300]
                if numbers:
                    milestones[sec] = min(numbers)

    return milestones


def parse_music_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    Universal entry point for parsing any music PDF.
    """
    raw_text = extract_text_from_pdf(pdf_path)
    metadata = parse_metadata_header(raw_text)
    structure = parse_chord_sheet_structure(raw_text)
    milestones = parse_score_pdf_milestones(raw_text)

    return {
        "source_file": os.path.basename(pdf_path),
        "metadata": metadata,
        "structure": structure,
        "milestones": milestones,
        "raw_text": raw_text
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 pdf_extractor.py <path_to_pdf>")
        sys.exit(1)

    result = parse_music_pdf(sys.argv[1])
    print(f"=== Metadata from {result['source_file']} ===")
    print(f"Title: {result['metadata']['title']}")
    print(f"Artist: {result['metadata']['artist']}")
    print(f"Key: {result['metadata']['key']}")
    print(f"Tempo: {result['metadata']['tempo_bpm']} BPM")
    print(f"Capo: {result['metadata']['capo']}")
    print(f"Strumming: {result['metadata']['strum_pattern']}")
    print(f"Chords: {', '.join(result['metadata']['chords_detected'])}")
    print(f"\n=== Sections Found ({len(result['structure'])}) ===")
    for sec in result['structure']:
        print(f"\n[{sec['name']}] ({len(sec['lines'])} lines)")
        for l in sec['lines'][:3]:
            print(f"  {l['chordpro_line']}")
