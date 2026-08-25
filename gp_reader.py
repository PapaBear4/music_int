#!/usr/bin/env python3
"""
Guitar Pro (.gp / .gpif) Human-Readable Reader and Converter
Parses modern Guitar Pro archives and converts them into ASCII tabs, ChordPro, Markdown summaries, and UMS JSON.
"""

import os
import sys
import zipfile
import json
import argparse
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional, Tuple

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def midi_to_note_name(midi_pitch: int) -> str:
    """Converts a MIDI pitch number (e.g., 40) to note name with octave (e.g., 'E2')."""
    if midi_pitch < 0 or midi_pitch > 127:
        return f"?({midi_pitch})"
    name = NOTE_NAMES[midi_pitch % 12]
    octave = (midi_pitch // 12) - 1
    return f"{name}{octave}"

def parse_gp_archive(file_path: str) -> Tuple[ET.Element, Dict[str, Any]]:
    """Extracts and parses score.gpif from a .gp archive or directly from an XML/GPIF file."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Check if raw XML/GPIF
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            first_chars = f.read(100).strip()
            if first_chars.startswith("<?xml") or first_chars.startswith("<gpif"):
                f.seek(0)
                tree = ET.parse(f)
                return tree.getroot(), {"type": "raw_xml"}
    except Exception:
        pass

    # Try unzipping (.gp / PKZip archive)
    if zipfile.is_zipfile(file_path):
        with zipfile.ZipFile(file_path, 'r') as gp_zip:
            target_xml = None
            for name in gp_zip.namelist():
                if name.endswith('score.gpif') or name.endswith('.gpif') or name.endswith('.xml'):
                    target_xml = name
                    break
            
            if not target_xml:
                raise ValueError("Could not find 'score.gpif' or XML score within .gp archive.")

            preferences = {}
            if "Content/Preferences.json" in gp_zip.namelist():
                try:
                    preferences = json.loads(gp_zip.read("Content/Preferences.json").decode("utf-8"))
                except Exception:
                    pass

            version_str = "Unknown"
            if "VERSION" in gp_zip.namelist():
                try:
                    version_str = gp_zip.read("VERSION").decode("utf-8").strip()
                except Exception:
                    pass

            with gp_zip.open(target_xml) as xml_file:
                tree = ET.parse(xml_file)
                return tree.getroot(), {"type": "gp_zip", "version": version_str, "preferences": preferences}

    raise ValueError("Unsupported file format. Expected a .gp PKZip archive or .gpif XML file.")

class GuitarProScore:
    """Represents a fully parsed Guitar Pro score graph."""

    def __init__(self, root_or_path: Any, meta_extra: Optional[Dict[str, Any]] = None):
        if isinstance(root_or_path, str):
            root, extra = parse_gp_archive(root_or_path)
            self.root = root
            self.meta_extra = extra
        else:
            self.root = root_or_path
            self.meta_extra = meta_extra or {}

        self.metadata: Dict[str, str] = {}
        self.tempo = 120
        self.automations: List[Dict[str, Any]] = []
        self.sections: Dict[int, Dict[str, str]] = {}
        self.tracks: List[Dict[str, Any]] = []
        self.masterbars: List[Dict[str, Any]] = []
        self.rhythms: Dict[int, Dict[str, Any]] = {}
        self.notes: Dict[int, Dict[str, Any]] = {}
        self.beats: Dict[int, Dict[str, Any]] = {}
        self.voices: Dict[int, Dict[str, Any]] = {}
        self.bars: Dict[int, Dict[str, Any]] = {}
        self._parse()

    @classmethod
    def from_file(cls, path: str) -> "GuitarProScore":
        root, extra = parse_gp_archive(path)
        return cls(root, extra)

    @staticmethod
    def _child(elem: Optional[ET.Element], tag: str) -> Optional[ET.Element]:
        if elem is None:
            return None
        target = tag.lower()
        for c in elem:
            if c.tag.lower() == target:
                return c
        return None

    @staticmethod
    def _children(elem: Optional[ET.Element], tag: str) -> List[ET.Element]:
        if elem is None:
            return []
        target = tag.lower()
        return [c for c in elem if c.tag.lower() == target]

    @staticmethod
    def _text(elem: Optional[ET.Element], tag: str, default: str = "") -> str:
        c = GuitarProScore._child(elem, tag)
        if c is not None and c.text:
            return c.text.strip()
        return default

    @staticmethod
    def _prop(elem: Optional[ET.Element], prop_name: str) -> Optional[str]:
        if elem is None:
            return None
        props = GuitarProScore._child(elem, 'properties')
        if props is None:
            return None
        target = prop_name.lower()
        for p in GuitarProScore._children(props, 'property'):
            if p.attrib.get('name', '').lower() == target:
                for val_elem in p:
                    if val_elem.text and val_elem.text.strip():
                        return val_elem.text.strip()
                if p.text and p.text.strip():
                    return p.text.strip()
        return None

    def _parse(self):
        # 1. Metadata (<Score> / <score>)
        score_node = self._child(self.root, 'score')
        if score_node is not None:
            for child in score_node:
                val = (child.text or "").strip()
                if val:
                    self.metadata[child.tag.lower()] = val
                    self.metadata[child.tag] = val

        # Normalize Title, Artist, Album, Transcriber
        raw_title = self.metadata.get("title") or self.metadata.get("subtitle") or self.metadata.get("name") or ""
        raw_artist = self.metadata.get("artist") or self.metadata.get("music") or self.metadata.get("words") or self.metadata.get("author") or self.metadata.get("composer") or self.metadata.get("band") or ""
        raw_album = self.metadata.get("album") or self.metadata.get("collection") or ""
        raw_tabber = self.metadata.get("tabber") or self.metadata.get("transcriber") or ""

        if raw_title and not self.metadata.get("title"):
            self.metadata["title"] = raw_title
        if raw_artist and not self.metadata.get("artist"):
            self.metadata["artist"] = raw_artist
        if raw_album and not self.metadata.get("album"):
            self.metadata["album"] = raw_album
        if raw_tabber and not self.metadata.get("tabber"):
            self.metadata["tabber"] = raw_tabber

        # 2. Master Track (Tempo & Sections)
        mt_node = self._child(self.root, 'mastertrack')
        if mt_node is not None:
            auto_node = self._child(mt_node, 'automations')
            if auto_node is not None:
                for a in self._children(auto_node, 'automation'):
                    atype = self._text(a, 'type')
                    val = self._text(a, 'value')
                    pos = int(self._text(a, 'position', '0') or 0)
                    if atype.lower() == "tempo" and val:
                        try:
                            bpm = float(val.split()[0])
                            self.automations.append({"type": "tempo", "bpm": bpm, "position": pos})
                            if pos == 0:
                                self.tempo = int(bpm)
                        except Exception:
                            pass
            
            sec_node = self._child(mt_node, 'sections')
            if sec_node is not None:
                for s in self._children(sec_node, 'section'):
                    sid = int(s.attrib.get('id', 0))
                    name = self._text(s, 'name')
                    text = self._text(s, 'text')
                    self.sections[sid] = {"name": name, "text": text}

        # 3. Tracks
        tracks_node = self._child(self.root, 'tracks')
        if tracks_node is not None:
            for t in self._children(tracks_node, 'track'):
                tid = int(t.attrib.get('id', len(self.tracks)))
                name = self._text(t, 'name', f"Track {tid + 1}")
                color = self._text(t, 'color', '255,255,255')
                
                # Properties
                tuning_pitches = [40, 45, 50, 55, 59, 64] # Default Standard E
                capo = 0
                
                # Check track properties
                tuning_str = self._prop(t, 'tuning')
                if tuning_str:
                    try:
                        tuning_pitches = [int(p) for p in tuning_str.split()]
                    except Exception:
                        pass
                capo_str = self._prop(t, 'capofret')
                if capo_str:
                    try:
                        capo = int(capo_str)
                    except Exception:
                        pass

                # Check staff properties
                staves_node = self._child(t, 'staves')
                if staves_node is not None:
                    for s in self._children(staves_node, 'staff'):
                        s_tuning = self._prop(s, 'tuning')
                        if s_tuning:
                            try:
                                tuning_pitches = [int(p) for p in s_tuning.split()]
                            except Exception:
                                pass
                        s_capo = self._prop(s, 'capofret')
                        if s_capo:
                            try:
                                capo = int(s_capo)
                            except Exception:
                                pass

                tuning_names = [midi_to_note_name(p) for p in tuning_pitches]
                self.tracks.append({
                    "id": tid,
                    "name": name,
                    "color": color,
                    "tuning_pitches": tuning_pitches,
                    "tuning_names": tuning_names,
                    "string_count": len(tuning_pitches),
                    "capo": capo
                })

        # 4. Rhythms
        rhythms_node = self._child(self.root, 'rhythms')
        if rhythms_node is not None:
            for r in self._children(rhythms_node, 'rhythm'):
                rid = int(r.attrib.get('id', len(self.rhythms)))
                note_val = self._text(r, 'notevalue', 'Quarter')
                tuplet = None
                tup_node = self._child(r, 'primarytuplet')
                if tup_node is not None:
                    tuplet = (int(tup_node.attrib.get('num', 3)), int(tup_node.attrib.get('den', 2)))
                dots = int(self._text(r, 'augmentationdot', '0') or 0)
                self.rhythms[rid] = {
                    "id": rid,
                    "note_value": note_val,
                    "tuplet": tuplet,
                    "dots": dots
                }

        # 5. Notes
        notes_node = self._child(self.root, 'notes')
        if notes_node is not None:
            for n in self._children(notes_node, 'note'):
                nid = int(n.attrib.get('id', len(self.notes)))
                fret = 0
                string_idx = 0
                tie = False
                hopo = False
                bend = None
                slide = None
                pm = False
                vibrato = False

                fret_str = self._prop(n, 'fret')
                if fret_str:
                    try:
                        fret = int(fret_str)
                    except Exception:
                        pass
                
                string_str = self._prop(n, 'string')
                if string_str:
                    try:
                        string_idx = int(string_str)
                    except Exception:
                        pass

                tie_str = self._prop(n, 'tie')
                if tie_str and tie_str.lower() == 'true':
                    tie = True

                hopo_orig = self._prop(n, 'hopoorigin')
                hopo_dest = self._prop(n, 'hopodestination')
                if (hopo_orig and hopo_orig.lower() == 'true') or (hopo_dest and hopo_dest.lower() == 'true'):
                    hopo = True

                bend_val = self._prop(n, 'bend')
                if bend_val:
                    bend = bend_val

                slide_val = self._prop(n, 'slide')
                if slide_val:
                    slide = slide_val

                pm_str = self._prop(n, 'palmmute')
                if pm_str and pm_str.lower() == 'true':
                    pm = True

                vib_str = self._prop(n, 'vibrato')
                if vib_str and vib_str.lower() == 'true':
                    vibrato = True

                self.notes[nid] = {
                    "id": nid,
                    "fret": fret,
                    "string": string_idx,
                    "tie": tie,
                    "hopo": hopo,
                    "bend": bend,
                    "slide": slide,
                    "palm_mute": pm,
                    "vibrato": vibrato
                }

        # 6. Beats
        beats_node = self._child(self.root, 'beats')
        if beats_node is not None:
            for b in self._children(beats_node, 'beat'):
                bid = int(b.attrib.get('id', len(self.beats)))
                r_ref = 0
                r_node = self._child(b, 'rhythm')
                if r_node is not None:
                    r_ref = int(r_node.attrib.get('ref', 0))
                
                notes_text = self._text(b, 'notes')
                note_ids = [int(x) for x in notes_text.split()] if notes_text.strip() else []
                
                chord_name = self._prop(b, 'chord')
                text_val = self._prop(b, 'freetext') or self._prop(b, 'text')
                pm_str = self._prop(b, 'palmmute')
                pm = pm_str.lower() == 'true' if pm_str else False
                stroke = self._prop(b, 'pickstroke')

                # Lyrics and Dynamic
                lyr_elem = self._child(b, 'lyrics')
                lyrics_text = None
                if lyr_elem is not None:
                    lines = [(l.text or "").strip() for l in self._children(lyr_elem, 'line')]
                    clean_lines = [l for l in lines if l]
                    if clean_lines:
                        lyrics_text = " ".join(clean_lines)

                dyn_text = self._text(b, 'dynamic')
                dynamic_val = dyn_text.lower() if dyn_text else None

                self.beats[bid] = {
                    "id": bid,
                    "rhythm_ref": r_ref,
                    "note_ids": note_ids,
                    "chord": chord_name,
                    "text": text_val,
                    "lyrics": lyrics_text,
                    "dynamic": dynamic_val,
                    "palm_mute": pm,
                    "pick_stroke": stroke
                }

        # 7. Voices
        voices_node = self._child(self.root, 'voices')
        if voices_node is not None:
            for v in self._children(voices_node, 'voice'):
                vid = int(v.attrib.get('id', len(self.voices)))
                beats_text = self._text(v, 'beats')
                beat_ids = [int(x) for x in beats_text.split() if int(x) >= 0] if beats_text.strip() else []
                self.voices[vid] = {"id": vid, "beat_ids": beat_ids}

        # 8. Bars
        bars_node = self._child(self.root, 'bars')
        if bars_node is not None:
            for bar in self._children(bars_node, 'bar'):
                bar_id = int(bar.attrib.get('id', len(self.bars)))
                voices_text = self._text(bar, 'voices')
                voice_ids = [int(x) for x in voices_text.split() if int(x) >= 0] if voices_text.strip() else []
                clef_text = self._text(bar, 'clef')
                clef_val = "bass" if clef_text and ("f" in clef_text.lower() or "bass" in clef_text.lower()) else "treble"
                self.bars[bar_id] = {"id": bar_id, "voice_ids": voice_ids, "clef": clef_val}

        # 9. Masterbars
        mb_node = self._child(self.root, 'masterbars')
        if mb_node is not None:
            for mb in self._children(mb_node, 'masterbar'):
                mb_id = int(mb.attrib.get('id', len(self.masterbars)))
                time_sig = self._text(mb, 'time', '4/4')
                bars_text = self._text(mb, 'bars')
                bar_ids = [int(x) for x in bars_text.split() if int(x) >= 0] if bars_text.strip() else []
                
                sec_id = None
                sec_elem = self._child(mb, 'section')
                if sec_elem is not None:
                    sec_id = int(sec_elem.attrib.get('id', 0))

                self.masterbars.append({
                    "id": mb_id,
                    "time": time_sig,
                    "bar_ids": bar_ids,
                    "section_id": sec_id
                })

    @property
    def primary_time_signature(self) -> str:
        if not self.masterbars:
            return "4/4"
        counts: Dict[str, int] = {}
        for mb in self.masterbars:
            t = mb.get("time", "4/4")
            counts[t] = counts.get(t, 0) + 1
        return max(counts, key=counts.get)

    @property
    def has_pickup_measure(self) -> bool:
        if not self.masterbars or len(self.masterbars) < 2:
            return False
        return self.masterbars[0].get("time") != self.primary_time_signature

    def get_all_chords(self) -> List[str]:
        """Returns sorted list of all unique chord names referenced across beats."""
        chords = set()
        for b in self.beats.values():
            if b.get("chord"):
                chords.add(b["chord"])
        return sorted(list(chords))

    def get_track_bars(self, track_idx: int) -> List[Dict[str, Any]]:
        """Returns ordered bars and beat data for a specific track."""
        if track_idx < 0 or track_idx >= len(self.tracks):
            return []
        
        result_bars = []
        for mb_idx, mb in enumerate(self.masterbars):
            bar_data = {
                "measure_number": mb_idx + 1,
                "time": mb["time"],
                "clef": "treble",
                "section": self.sections.get(mb["section_id"]) if mb["section_id"] is not None else None,
                "beats": []
            }

            if track_idx < len(mb["bar_ids"]):
                bar_id = mb["bar_ids"][track_idx]
                bar_obj = self.bars.get(bar_id)
                if bar_obj:
                    bar_data["clef"] = bar_obj.get("clef", "treble")
                    if bar_obj["voice_ids"]:
                        # Primary voice 0
                        v_id = bar_obj["voice_ids"][0]
                        v_obj = self.voices.get(v_id)
                        if v_obj:
                            for b_id in v_obj["beat_ids"]:
                                b_obj = self.beats.get(b_id)
                                if b_obj:
                                    beat_info = {
                                        "id": b_id,
                                        "rhythm": self.rhythms.get(b_obj["rhythm_ref"], {}),
                                        "chord": b_obj["chord"],
                                        "text": b_obj["text"],
                                        "lyrics": b_obj.get("lyrics"),
                                        "dynamic": b_obj.get("dynamic"),
                                        "palm_mute": b_obj["palm_mute"],
                                        "notes": [self.notes.get(n_id) for n_id in b_obj["note_ids"] if n_id in self.notes]
                                    }
                                    bar_data["beats"].append(beat_info)

            result_bars.append(bar_data)
        return result_bars

    def to_ascii_tab(self, track_idx: int = 0, bars_per_row: int = 2) -> str:
        """Generates standard monospace ASCII tablature."""
        if not self.tracks:
            return "No tracks found in score."

        track = self.tracks[track_idx] if 0 <= track_idx < len(self.tracks) else self.tracks[0]
        string_count = track["string_count"]
        # In Guitar Pro, string 0 is usually highest pitch (top line in tab), string N-1 is lowest pitch (bottom line)
        # Tuning names reversed for tab display (high string at top)
        tuning_labels = []
        for s in range(string_count):
            tuning_idx = string_count - 1 - s
            if 0 <= tuning_idx < len(track["tuning_names"]):
                note_str = track["tuning_names"][tuning_idx]
                letter = note_str[0].lower() if s == 0 else note_str[0].upper()
                tuning_labels.append(letter)
            else:
                tuning_labels.append("-")

        bars = self.get_track_bars(self.tracks.index(track))
        output_lines = []

        # Header
        output_lines.append("=" * 80)
        output_lines.append(f" TAB: {self.metadata.get('title', 'Untitled')}")
        time_display = f"{self.primary_time_signature} (Pickup: {self.masterbars[0]['time']})" if self.has_pickup_measure else self.primary_time_signature
        output_lines.append(f" ARTIST: {self.metadata.get('artist', 'Unknown')}  |  TEMPO: {self.tempo} BPM  |  TIME: {time_display}")
        output_lines.append(f" TRACK {track['id'] + 1}: {track['name']}")
        output_lines.append(f" TUNING: {' '.join(track['tuning_names'])} (Capo: {track['capo']})")
        output_lines.append("=" * 80)
        output_lines.append("")

        # Render bars in rows
        num_bars = len(bars)
        for row_start in range(0, num_bars, bars_per_row):
            row_bars = bars[row_start: min(row_start + bars_per_row, num_bars)]
            
            # Check for section markers
            section_titles = []
            for b in row_bars:
                if b["section"]:
                    section_titles.append(f"=== {b['section']['name']} ({b['section']['text']}) ===" if b['section']['text'] else f"=== {b['section']['name']} ===")
            if section_titles:
                output_lines.append("")
                output_lines.append("  " + "  |  ".join(section_titles))

            # Measure header & chords line
            chord_line_parts = ["    "]
            measure_header_parts = ["    "]
            
            # String lines buffers
            str_lines = {s: f"{tuning_labels[s]}|" for s in range(string_count)}

            for b in row_bars:
                m_num = f"Bar {b['measure_number']} [{b['time']}]"
                beats = b["beats"]
                
                # Determine beat column strings
                col_slots = []
                for beat in beats:
                    chord = beat.get("chord") or ""
                    notes_by_string = {n["string"]: n for n in beat.get("notes", [])}
                    col_slots.append({
                        "chord": chord,
                        "notes": notes_by_string,
                        "pm": beat.get("palm_mute", False)
                    })

                # If bar is empty
                if not col_slots:
                    col_slots = [{"chord": "", "notes": {}, "pm": False}]

                bar_str_buffers = {s: "" for s in range(string_count)}
                bar_chord_buffer = ""
                
                # Format each beat slot
                for slot in col_slots:
                    chord = slot["chord"]
                    # Calculate max fret text width
                    max_w = 3
                    slot_frets = {}
                    for s in range(string_count):
                        if s in slot["notes"]:
                            n = slot["notes"][s]
                            txt = str(n["fret"])
                            if n.get("hopo"):
                                txt += "h"
                            elif n.get("bend"):
                                txt += "b"
                            elif n.get("slide"):
                                txt += "/"
                            elif n.get("vibrato"):
                                txt += "~"
                            slot_frets[s] = txt
                            max_w = max(max_w, len(txt) + 2)
                        else:
                            slot_frets[s] = "-"
                    
                    if chord:
                        max_w = max(max_w, len(chord) + 1)

                    # Append to bar buffers
                    for s in range(string_count):
                        f_txt = slot_frets[s]
                        if f_txt == "-":
                            seg = "-" * max_w
                        else:
                            seg = f"-{f_txt}".ljust(max_w, "-")
                        bar_str_buffers[s] += seg

                    c_seg = chord.ljust(max_w, " ") if chord else " " * max_w
                    bar_chord_buffer += c_seg

                # Append measure
                bar_len = len(bar_str_buffers[0])
                m_hdr = m_num.ljust(bar_len + 1, " ")
                measure_header_parts.append(m_hdr)
                chord_line_parts.append(bar_chord_buffer + " ")

                for s in range(string_count):
                    str_lines[s] += bar_str_buffers[s] + "|"

            output_lines.append("".join(chord_line_parts))
            output_lines.append("".join(measure_header_parts))
            for s in range(string_count):
                output_lines.append(str_lines[s])
            output_lines.append("")

        return "\n".join(output_lines)

    def to_summary_markdown(self) -> str:
        """Generates a structured Markdown summary of the song."""
        lines = []
        lines.append(f"# {self.metadata.get('title', 'Untitled')}")
        if self.metadata.get('artist'):
            lines.append(f"**Artist**: {self.metadata['artist']}")
        if self.metadata.get('album'):
            lines.append(f"**Album**: {self.metadata['album']}")
        time_display = f"{self.primary_time_signature} ({self.masterbars[0]['time']} pickup)" if self.has_pickup_measure else self.primary_time_signature
        lines.append(f"**Tempo**: {self.tempo} BPM  |  **Time Signature**: {time_display}  |  **Total Measures**: {len(self.masterbars)}")
        if self.metadata.get('tabber'):
            lines.append(f"**Transcriber**: {self.metadata['tabber']}")
        if self.metadata.get('copyright'):
            lines.append(f"**Copyright**: {self.metadata['copyright']}")
        if self.metadata.get('instructions'):
            lines.append(f"> *Instructions: {self.metadata['instructions']}*")
        lines.append("")

        # Tracks Table
        lines.append("## Instrumentation & Tracks")
        lines.append("| # | Track Name | Tuning | Capo | Strings |")
        lines.append("|---|---|---|---|---|")
        for i, t in enumerate(self.tracks):
            lines.append(f"| {i + 1} | {t['name']} | {' '.join(t['tuning_names'])} | Fret {t['capo']} | {t['string_count']} |")
        lines.append("")

        # Sections & Structure Timeline
        lines.append("## Song Structure & Sections")
        if self.sections:
            lines.append("| Section ID | Name | Bar Start | Description |")
            lines.append("|---|---|---|---|")
            for mb_idx, mb in enumerate(self.masterbars):
                if mb["section_id"] is not None and mb["section_id"] in self.sections:
                    sec = self.sections[mb["section_id"]]
                    lines.append(f"| {mb['section_id']} | **{sec['name']}** | Measure {mb_idx + 1} | {sec['text'] or '-'} |")
        else:
            lines.append("No explicit section markers found in score.")
        lines.append("")

        # Chords used
        chords_found = set()
        for b in self.beats.values():
            if b.get("chord"):
                chords_found.add(b["chord"])
        
        if chords_found:
            lines.append(f"## Chords Detected ({len(chords_found)})")
            lines.append("`" + "`, `".join(sorted(chords_found)) + "`")
            lines.append("")

        return "\n".join(lines)

    def to_chordpro(self) -> str:
        """Generates a Lead Sheet in ChordPro format."""
        lines = []
        lines.append(f"{{title: {self.metadata.get('title', 'Untitled')}}}")
        if self.metadata.get('artist'):
            lines.append(f"{{artist: {self.metadata['artist']}}}")
        if self.metadata.get('album'):
            lines.append(f"{{album: {self.metadata['album']}}}")
        lines.append(f"{{tempo: {self.tempo}}}")
        if self.tracks:
            lines.append(f"{{capo: {self.tracks[0]['capo']}}}")
            lines.append(f"{{tuning: {' '.join(self.tracks[0]['tuning_names'])}}}")
        lines.append("")

        current_section = None
        bars = self.get_track_bars(0)
        
        for b in bars:
            if b["section"]:
                if current_section:
                    lines.append(f"{{end_of_{current_section}}}")
                    lines.append("")
                sec_name = b["section"]["name"].lower()
                if "verse" in sec_name:
                    current_section = "verse"
                    lines.append("{start_of_verse}")
                elif "chorus" in sec_name:
                    current_section = "chorus"
                    lines.append("{start_of_chorus}")
                elif "bridge" in sec_name:
                    current_section = "bridge"
                    lines.append("{start_of_bridge}")
                else:
                    current_section = "section"
                    lines.append(f"# --- {b['section']['name']} ---")

            bar_chords = []
            for beat in b["beats"]:
                if beat.get("chord"):
                    bar_chords.append(f"[{beat['chord']}]")
            
            if bar_chords:
                lines.append(f"| {' '.join(bar_chords)} |  (Bar {b['measure_number']})")
            else:
                lines.append(f"| . |  (Bar {b['measure_number']})")

        if current_section:
            lines.append(f"{{end_of_{current_section}}}")

        return "\n".join(lines)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes score structure and tracks into a standard dictionary."""
        return {
            "metadata": self.metadata,
            "tempo": self.tempo,
            "tracks": self.tracks,
            "masterbars": self.masterbars,
            "sections": self.sections,
            "bars": self.get_track_bars(0) if self.tracks else [],
            "has_pickup_measure": self.has_pickup_measure,
            "primary_time_signature": self.primary_time_signature
        }

    def to_ums_json(self) -> Dict[str, Any]:
        """Converts score into Unified Music Schema (UMS) SongGraph JSON with complete tri-layer structure."""
        primary_track = self.tracks[0] if self.tracks else {
            "id": 0, "name": "Primary", "tuning_names": ["E2", "A2", "D3", "G3", "B3", "E4"],
            "tuning_pitches": [40, 45, 50, 55, 59, 64], "capo": 0, "string_count": 6
        }
        tuning_pitches = primary_track.get("tuning_pitches", [40, 45, 50, 55, 59, 64])
        string_count = len(tuning_pitches)
        capo = primary_track.get("capo", 0)

        # Build structure maps
        structure_blocks = []
        current_block = {
            "block_name": "Score",
            "sectionId": "section_0",
            "sectionLabel": "Intro",
            "measures": []
        }

        bars = self.get_track_bars(0)
        for b in bars:
            if b["section"]:
                if current_block["measures"]:
                    structure_blocks.append(current_block)
                sec_name = b["section"]["name"]
                current_block = {
                    "block_name": sec_name,
                    "sectionId": f"sec_{len(structure_blocks)}",
                    "sectionLabel": sec_name,
                    "section_overrides": {
                        "tempo_bpm": self.tempo,
                        "time_signature": b["time"]
                    },
                    "measures": []
                }

            # Build measure events with complete tri-layer model
            events = []
            cur_beat_division = 1.0
            clef_val = b.get("clef", "treble")

            for beat in b["beats"]:
                rhythm_obj = beat.get("rhythm", {})
                rhythm_name = rhythm_obj.get("note_value", "Quarter")
                dur_base = {
                    "Whole": 4.0, "Half": 2.0, "Quarter": 1.0, "Eighth": 0.5,
                    "16th": 0.25, "Sixteenth": 0.25, "32nd": 0.125, "64th": 0.0625
                }.get(rhythm_name, 1.0)
                if rhythm_obj.get("dots") == 1:
                    dur_base *= 1.5
                elif rhythm_obj.get("dots") == 2:
                    dur_base *= 1.75
                tuplet = rhythm_obj.get("tuplet")
                if tuplet and len(tuplet) == 2 and tuplet[0] > 0:
                    dur_base *= (tuplet[1] / tuplet[0])

                chord = beat.get("chord")
                lyric = beat.get("lyrics") or beat.get("text")
                dyn = beat.get("dynamic") or "mf"

                notes_tab = []
                notes_notation = []
                for n in beat.get("notes", []):
                    s_idx = n.get("string", 0)
                    fret_val = n.get("fret", 0)
                    notes_tab.append({
                        "string": s_idx,
                        "fret": fret_val,
                        "hopo": n.get("hopo", False),
                        "bend": n.get("bend"),
                        "slide": n.get("slide"),
                        "vibrato": n.get("vibrato", False),
                        "palm_mute": n.get("palm_mute", False)
                    })

                    # Calculate MIDI Pitch & Concert Note Name
                    t_idx = string_count - 1 - s_idx
                    open_p = tuning_pitches[t_idx] if 0 <= t_idx < len(tuning_pitches) else 64
                    midi_p = open_p + fret_val + capo
                    pitch_str = midi_to_note_name(midi_p)
                    notes_notation.append({
                        "pitch": pitch_str,
                        "midi_pitch": midi_p,
                        "duration": rhythm_name,
                        "dynamics": dyn
                    })

                event_obj = {
                    "beat_division": round(cur_beat_division, 3),
                    "layer_a": {
                        "chord": chord,
                        "lyrics": lyric
                    },
                    "layer_b": {
                        "tab_positions": notes_tab,
                        "rhythm": rhythm_name
                    },
                    "layer_c": {
                        "clef": clef_val,
                        "notes": notes_notation
                    },
                    "hard_fault": None
                }
                events.append(event_obj)
                cur_beat_division += dur_base

            current_block["measures"].append({
                "measure_index": b["measure_number"],
                "measure_number": b["measure_number"],
                "time_signature": b["time"],
                "events": events,
                "musical_events": events
            })

        if current_block["measures"]:
            structure_blocks.append(current_block)

        song_graph = {
            "schema_version": "1.1.0",
            "canonical": {
                "title": self.metadata.get("title", "Untitled"),
                "artist": self.metadata.get("artist", "Unknown"),
                "genre": self.metadata.get("genre"),
                "original_key": "Am",
                "original_tempo_bpm": self.tempo,
                "original_time_signature": self.primary_time_signature,
                "original_tuning": " ".join(self.tracks[0]["tuning_names"]) if self.tracks else "EADGBE",
                "original_capo": self.tracks[0]["capo"] if self.tracks else 0,
                "tags": ["guitar_pro", "tab", "unified_music_schema"]
            },
            "tracks": self.tracks,
            "structure": structure_blocks,
            "reconciliation_log": [],
            "requires_agent_intervention": False
        }
        return song_graph


def normalize_ums_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Forward-migrates any legacy or flat UMS payload into the standardized tri-layer schema.
    """
    if not isinstance(payload, dict):
        return payload

    canonical = payload.get("canonical", {})
    tuning_str = canonical.get("original_tuning", "E2 A2 D3 G3 B3 E4")
    capo = canonical.get("original_capo", 0)

    # Standard default tuning pitches
    tuning_pitches = [40, 45, 50, 55, 59, 64]

    structure = payload.get("structure", [])
    for block in structure:
        for measure in block.get("measures", []):
            raw_events = measure.get("musical_events") or measure.get("events") or []
            normalized_events = []
            cur_beat = 1.0

            for ev in raw_events:
                # Check if already canonical
                if "layer_a" in ev and "layer_b" in ev and "layer_c" in ev:
                    normalized_events.append(ev)
                    continue

                # Migrate legacy flat keys
                chord_val = ev.get("layer_a_chord") or ev.get("chord")
                lyric_val = ev.get("text") or ev.get("lyrics")
                rhythm_val = ev.get("rhythm", "Quarter")
                dur_base = {
                    "Whole": 4.0, "Half": 2.0, "Quarter": 1.0, "Eighth": 0.5,
                    "16th": 0.25, "Sixteenth": 0.25, "32nd": 0.125, "64th": 0.0625
                }.get(rhythm_val, 1.0)

                tab_positions = ev.get("layer_b_tab") or ev.get("tab_positions") or []
                notes_notation = []
                for tp in tab_positions:
                    s_idx = tp.get("string", 0)
                    f_val = tp.get("fret", 0)
                    t_idx = len(tuning_pitches) - 1 - s_idx
                    open_p = tuning_pitches[t_idx] if 0 <= t_idx < len(tuning_pitches) else 64
                    midi_p = open_p + f_val + capo
                    notes_notation.append({
                        "pitch": midi_to_note_name(midi_p),
                        "midi_pitch": midi_p,
                        "duration": rhythm_val,
                        "dynamics": "mf"
                    })

                beat_div = ev.get("beat_division") or round(cur_beat, 3)

                norm_ev = {
                    "beat_division": beat_div,
                    "layer_a": {
                        "chord": chord_val,
                        "lyrics": lyric_val
                    },
                    "layer_b": {
                        "tab_positions": tab_positions,
                        "rhythm": rhythm_val
                    },
                    "layer_c": {
                        "clef": "treble",
                        "notes": notes_notation
                    },
                    "hard_fault": ev.get("hard_fault")
                }
                normalized_events.append(norm_ev)
                cur_beat += dur_base

            measure["events"] = normalized_events
            measure["musical_events"] = normalized_events

    payload["schema_version"] = "1.1.0"
    return payload


def main():
    parser = argparse.ArgumentParser(description="Guitar Pro (.gp) & Multi-Source Music Human-Readable Reader and Converter")
    parser.add_argument("file", help="Path to .gp, .gpx, or .gpif file")
    parser.add_argument("-f", "--format", choices=["ascii", "summary", "chordpro", "json", "xml"], default="ascii",
                        help="Output format (default: ascii)")
    parser.add_argument("-t", "--track", type=int, default=0, help="Track index for ASCII tab / ChordPro (default: 0)")
    parser.add_argument("-w", "--wrap", type=int, default=2, help="Bars per line in ASCII tab (default: 2)")
    parser.add_argument("-o", "--output", help="Save output to file instead of printing to stdout")
    parser.add_argument("--list-tracks", action="store_true", help="List all tracks in the file")
    parser.add_argument("--pdf", "--chords-pdf", dest="pdf", help="Path to chord sheet PDF to extract Key, Strumming, and Chords")
    parser.add_argument("--vocals-pdf", dest="vocals_pdf", help="Path to vocals / melody score PDF for measure alignment")
    parser.add_argument("--piano-pdf", dest="piano_pdf", help="Path to piano / score PDF for measure alignment")

    args = parser.parse_args()

    try:
        score = GuitarProScore(args.file)

        if args.list_tracks:
            print(f"Tracks in '{args.file}':")
            for i, t in enumerate(score.tracks):
                print(f"  [{i}] {t['name']} - Tuning: {' '.join(t['tuning_names'])} (Capo {t['capo']})")
            return

        # Load PDF data if provided
        pdf_chords_data = None
        pdf_score_data = None
        if args.pdf:
            import pdf_extractor
            pdf_chords_data = pdf_extractor.parse_music_pdf(args.pdf)
        if args.vocals_pdf or args.piano_pdf:
            import pdf_extractor
            score_pdf = args.vocals_pdf or args.piano_pdf
            pdf_score_data = pdf_extractor.parse_music_pdf(score_pdf)

        if args.format == "ascii":
            output_content = score.to_ascii_tab(track_idx=args.track, bars_per_row=args.wrap)
        elif args.format == "summary":
            if pdf_chords_data:
                import ums_builder
                ums = ums_builder.build_complete_ums(score, pdf_chords_data, pdf_score_data)
                meta = ums["canonical"]
                lines = [
                    f"# {meta['title']}",
                    f"**Artist**: {meta['artist']}",
                    f"**Key**: {meta['original_key']}  |  **Tempo**: {meta['original_tempo_bpm']} BPM  |  **Time Signature**: {meta['original_time_signature']}  |  **Total Measures**: {len(score.masterbars)}",
                ]
                if meta.get("strum_pattern"):
                    lines.append(f"**Strumming Pattern**: {meta['strum_pattern']}")
                if meta.get("chords_detected"):
                    lines.append(f"\n## Chords Detected ({len(meta['chords_detected'])})\n" + ", ".join([f"`{c}`" for c in meta["chords_detected"]]))
                lines.append(f"\n## Sections Identified ({len(ums['structure'])})")
                lines.append("| Section | Start Bar | Measures | Time Sig |")
                lines.append("|---|---|---|---|")
                for s in ums["structure"]:
                    start_b = s["measures"][0]["measure_number"] if s["measures"] else "-"
                    lines.append(f"| **{s['block_name']}** | Bar {start_b} | {len(s['measures'])} | {s['section_overrides']['time_signature']} |")
                output_content = "\n".join(lines)
            else:
                output_content = score.to_summary_markdown()
        elif args.format == "chordpro":
            if pdf_chords_data and pdf_chords_data.get("structure"):
                # Render full ChordPro from extracted PDF structure
                lines = [
                    f"{{title: {pdf_chords_data['metadata'].get('title') or score.metadata.get('title') or 'Untitled'}}}",
                    f"{{artist: {pdf_chords_data['metadata'].get('artist') or score.metadata.get('artist') or 'Unknown'}}}",
                    f"{{key: {pdf_chords_data['metadata'].get('key') or 'Am'}}}",
                    f"{{tempo: {score.tempo}}}",
                    f"{{time: {score.primary_time_signature}}}",
                    ""
                ]
                for sec in pdf_chords_data["structure"]:
                    sname = sec["name"]
                    lines.append(f"{{start_of_{sname.lower().replace(' ', '_')}: {sname}}}")
                    for l in sec.get("lines", []):
                        lines.append(l.get("chordpro_line", ""))
                    lines.append(f"{{end_of_{sname.lower().replace(' ', '_')}}}\n")
                output_content = "\n".join(lines)
            else:
                output_content = score.to_chordpro()
        elif args.format == "json":
            if pdf_chords_data or pdf_score_data:
                import ums_builder
                ums = ums_builder.build_complete_ums(score, pdf_chords_data, pdf_score_data)
                output_content = json.dumps(ums, indent=2)
            else:
                output_content = json.dumps(score.to_ums_json(), indent=2)
        elif args.format == "xml":
            output_content = ET.tostring(score.root, encoding="utf-8").decode("utf-8")
        else:
            output_content = score.to_ascii_tab()

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_content)
            print(f"Successfully exported to {args.output}")
        else:
            print(output_content)

    except Exception as e:
        print(f"Error parsing Guitar Pro file: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
