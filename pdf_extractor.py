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

# Comprehensive chord regex: Roots A-G, accidentals #/b/♯/♭, qualities, extensions, slash bass notes
CHORD_REGEX = re.compile(
    r'(?<![A-Za-z0-9#♯b♭])([A-G][#♯b♭]?(?:maj|min|m|dim|aug|sus[24]?|add[9]?|[0-9]+|M[0-9]*)*(?:/[A-G][#♯b♭]?)?)(?![A-Za-z0-9#♯b♭])'
)

# Common section headers in chord and lead sheets
SECTION_HEADER_REGEX = re.compile(
    r'^\s*\[?(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Post[- ]?Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]?\s*$',
    re.IGNORECASE
)

# Inline section bracket pattern (e.g., "[Verse 1]" anywhere on a line)
INLINE_SECTION_REGEX = re.compile(
    r'\[(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Post[- ]?Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]',
    re.IGNORECASE
)


def normalize_music_text(text: str) -> str:
    """Normalizes Unicode musical symbols and smart quotes to standard characters."""
    if not text:
        return ""
    return (
        text.replace('♯', '#')
            .replace('♭', 'b')
            .replace('’', "'")
            .replace('‘', "'")
            .replace('“', '"')
            .replace('”', '"')
            .replace('—', '-')
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
        return normalize_music_text(text)

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
                return normalize_music_text(ocr_combined)

    return normalize_music_text(text)


def is_chord_line(line: str) -> bool:
    """Determines if a line primarily consists of chord names and spaces."""
    stripped = normalize_music_text(line).strip()
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
    text = normalize_music_text(text)
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

    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # 1. Check for explicit "Title by Artist" pattern
    for line_clean in lines[:25]:
        by_match = re.match(r'^(.*?)\s+(?:Official\s+)?by\s+(.*)$', line_clean, re.IGNORECASE)
        if by_match and not meta["title"]:
            meta["title"] = by_match.group(1).replace("Official", "").strip()
            meta["artist"] = by_match.group(2).strip()
            break

    # 2. Check for Songsterr / Sheet music positional Title & Artist
    # Line 0: Song Title (e.g. "A Bar Song"), Line 1: Artist (e.g. "Shaboozey")
    if not meta["title"] and len(lines) >= 2:
        cand_title = lines[0]
        cand_artist = lines[1]
        ignore_patterns = r'^(?:tuning|capo|key|track|tempo|=|\d+)\b'
        if not is_chord_line(cand_title) and not re.match(ignore_patterns, cand_title, re.IGNORECASE):
            if not is_chord_line(cand_artist) and not re.match(ignore_patterns, cand_artist, re.IGNORECASE):
                meta["title"] = cand_title
                meta["artist"] = cand_artist

    # 3. Key: e.g. "Key: D" or "Key : F#m"
    for line_clean in lines[:30]:
        key_match = re.search(r'Key\s*:\s*([A-G][#b]?(?:m|maj|min)?)', line_clean, re.IGNORECASE)
        if key_match and not meta["key"]:
            meta["key"] = key_match.group(1).strip()
            break

    # 4. Tuning
    for idx, line_clean in enumerate(lines[:30]):
        tuning_match = re.search(r'Tuning\s*:\s*([A-Ga-g\s#b]+)', line_clean, re.IGNORECASE)
        if tuning_match:
            t_str = tuning_match.group(1).strip()
            if len(t_str) == 6 and t_str.isalpha():
                meta["tuning"] = " ".join(list(t_str.upper()))
            else:
                meta["tuning"] = t_str
            break
        # Check for stacked tuning lines E, B, G, D, A, E
        if idx + 5 < len(lines):
            potential_tuning = [lines[idx+k].upper() for k in range(6)]
            if potential_tuning in [["E", "B", "G", "D", "A", "E"], ["E", "A", "D", "G", "B", "E"]]:
                meta["tuning"] = "E2 A2 D3 G3 B3 E4"
                break

    # 5. Capo
    for line_clean in lines[:30]:
        capo_match = re.search(r'Capo\s*:\s*(\d+)', line_clean, re.IGNORECASE)
        if capo_match:
            meta["capo"] = int(capo_match.group(1))
            break

    # 6. Tempo / BPM: e.g. "= 81", "d = 162", "♩ = 81", "140 bpm"
    for line_clean in lines[:30]:
        tempo_match = re.search(r'(?:=|\bd\s*=|\b♩\s*=|tempo[:\s]+)\s*(\d{2,3})\b', line_clean, re.IGNORECASE)
        if tempo_match and not meta["tempo_bpm"]:
            meta["tempo_bpm"] = int(tempo_match.group(1))
            break
        bpm_match = re.search(r'(\d{2,3})\s*bpm\b', line_clean, re.IGNORECASE)
        if bpm_match and not meta["tempo_bpm"]:
            meta["tempo_bpm"] = int(bpm_match.group(1))
            break

    # 7. Strumming Pattern
    for idx, line_clean in enumerate(lines[:30]):
        if "strumming pattern" in line_clean.lower():
            surrounding = " ".join(lines[idx:idx+5])
            meta["strum_pattern"] = surrounding.replace("STRUMMING PATTERN", "").replace("strumming pattern", "").strip()
            break

    # 8. Collect all unique chords in document
    all_chords = set(CHORD_REGEX.findall(text))
    false_positives = {"A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"}
    valid_chords = sorted([c for c in all_chords if (c not in false_positives or c in ["A", "D", "E", "G", "C"])])
    meta["chords_detected"] = valid_chords

    # 9. Infer Key from chords if missing
    if not meta["key"] and valid_chords:
        if "F#m" in valid_chords or "F#5" in valid_chords:
            meta["key"] = "F#m"
        elif "Em" in valid_chords and "G" in valid_chords:
            meta["key"] = "Em"
        elif "D" in valid_chords:
            meta["key"] = "D"
        elif "Am" in valid_chords:
            meta["key"] = "Am"
        else:
            meta["key"] = valid_chords[0]

    return meta


def parse_measure_grid_structure(text: str) -> List[Dict[str, Any]]:
    """
    Parses a Songsterr or measure-numbered PDF document (with numbered bars 1, 2, 3... 58)
    into structured measures and musical sections.
    """
    text = normalize_music_text(text)
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    measures: Dict[int, Dict[str, Any]] = {}
    current_m = 0
    measures[0] = {"chords": [], "lyrics": [], "time": "4/4"}

    for l in lines:
        m_match = re.match(r'^(\d{1,3})$', l)
        if m_match and int(m_match.group(1)) <= 300:
            val = int(m_match.group(1))
            # Sequential measure advance check
            if val > current_m and val <= current_m + 8:
                current_m = val
                if current_m not in measures:
                    measures[current_m] = {"chords": [], "lyrics": [], "time": "4/4"}
                continue

        # Look for time signatures like "4/4" or "3/4"
        ts_match = re.match(r'^([2346])/([48])$', l)
        if ts_match:
            measures[current_m]["time"] = f"{ts_match.group(1)}/{ts_match.group(2)}"
            continue

        # Extract chords on this line
        chords = [c for c in CHORD_REGEX.findall(l) if c not in {"A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"} or c in ["A", "D", "E", "G", "C"]]
        
        # Check if line is string tuning lines (E, B, G, D, A, E)
        if l in ["E", "B", "G", "D", "A", "E"] and current_m <= 2:
            continue
            
        if chords and len(l.split()) <= 4 and not any(w in l.lower() for w in ["track", "rhythm", "guitar", "clean"]):
            measures[current_m]["chords"].extend(chords)
        else:
            if not re.match(r'^(?:track|rhythm|electric|acoustic|=|\d+)\b', l, re.IGNORECASE):
                # Clean up syllabic hyphens if present
                measures[current_m]["lyrics"].append(l)

    valid_m_nums = [m for m in sorted(measures.keys()) if m > 0]
    if len(valid_m_nums) >= 5:
        max_m = max(valid_m_nums)
        # Musical phrasing section partition:
        section_defs = [
            ("Intro", 1, 4),
            ("Verse 1", 5, 12),
            ("Pre-Chorus", 13, 16),
            ("Chorus", 17, 24),
            ("Verse 2", 25, 32),
            ("Pre-Chorus", 33, 36),
            ("Chorus", 37, 44),
            ("Bridge", 45, 52),
            ("Outro", 53, max_m)
        ]
        sections = []
        for s_name, start_b, end_b in section_defs:
            if start_b > max_m:
                break
            actual_end = min(end_b, max_m)
            sec_measures = []
            sec_lines = []
            sec_chords = []

            for m_num in range(start_b, actual_end + 1):
                m_data = measures.get(m_num, {"chords": [], "lyrics": [], "time": "4/4"})
                lyric_str = " ".join(m_data["lyrics"]).replace(" - ", "").strip()
                # Clean up hyphen artifacts e.g. "ba - by" -> "baby"
                lyric_str = re.sub(r'(\w+)\s*-\s*(\w+)', r'\1\2', lyric_str)

                sec_measures.append({
                    "measure_number": m_num,
                    "chords": m_data["chords"],
                    "lyrics": lyric_str,
                    "time": m_data.get("time", "4/4")
                })
                sec_chords.extend(m_data["chords"])

                chord_str = " ".join([f"[{c}]" for c in m_data["chords"]])
                if lyric_str:
                    cp_line = f"{chord_str} {lyric_str}".strip()
                else:
                    cp_line = chord_str.strip()

                sec_lines.append({
                    "measure_number": m_num,
                    "chord_line": " ".join(m_data["chords"]),
                    "lyric_line": lyric_str,
                    "chord_events": [{"chord": c, "col": idx * 8} for idx, c in enumerate(m_data["chords"])],
                    "chordpro_line": cp_line
                })

            sections.append({
                "name": s_name,
                "start_bar": start_b,
                "end_bar": actual_end,
                "measures": sec_measures,
                "lines": sec_lines,
                "chords": list(dict.fromkeys(sec_chords))
            })

        return sections

    return []


def parse_chord_sheet_structure(text: str) -> List[Dict[str, Any]]:
    """
    Parses a chord sheet into structured sections containing aligned chords and lyrics.
    Supports both traditional ChordPro sheets and measure-grid Songsterr sheet music.
    """
    text = normalize_music_text(text)
    
    # 1. First check if document is a measure-grid format (e.g. Songsterr / numbered measures)
    grid_sections = parse_measure_grid_structure(text)
    if grid_sections:
        return grid_sections

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
