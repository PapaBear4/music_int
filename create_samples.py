import os
import zipfile
import json

def create_sample_gp(output_path, title, artist, bpm, tracks_data, sections_data, masterbars_data, chords_data):
    """
    Creates a valid Guitar Pro 7/8 (.gp) PKZip archive.
    """
    # Build score.gpif XML
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpif version="7.0">',
        '  <gpversion>7.0</gpversion>',
        '  <score>',
        f'    <title><![CDATA[{title}]]></title>',
        f'    <subTitle><![CDATA[Human-Readable Tab Demo]]></subTitle>',
        f'    <artist><![CDATA[{artist}]]></artist>',
        f'    <album><![CDATA[Guitar Pro Showcase]]></album>',
        f'    <words><![CDATA[{artist}]]></words>',
        f'    <music><![CDATA[{artist}]]></music>',
        f'    <copyright><![CDATA[© 2026 Demo Transcriptions]]></copyright>',
        f'    <tabber><![CDATA[Antigravity Transcriber]]></tabber>',
        f'    <instructions><![CDATA[Standard demo tab for testing human-readable export]]></instructions>',
        '  </score>',
        '  <mastertrack>',
        '    <automations>',
        '      <automation>',
        '        <type>Tempo</type>',
        f'        <value>{bpm}.0 2</value>',
        '        <position>0</position>',
        '        <linear>false</linear>',
        '      </automation>',
        '    </automations>',
        '    <sections>'
    ]

    for sec in sections_data:
        xml_lines.append(f'      <section id="{sec["id"]}">')
        xml_lines.append(f'        <name><![CDATA[{sec["name"]}]]></name>')
        xml_lines.append(f'        <text><![CDATA[{sec.get("text", "")}]]></text>')
        xml_lines.append('      </section>')

    xml_lines.extend([
        '    </sections>',
        '  </mastertrack>',
        '  <tracks>'
    ])

    for trk in tracks_data:
        xml_lines.append(f'    <track id="{trk["id"]}">')
        xml_lines.append(f'      <name><![CDATA[{trk["name"]}]]></name>')
        xml_lines.append(f'      <color>{trk.get("color", "255,128,0")}</color>')
        xml_lines.append('      <properties>')
        xml_lines.append('        <property name="Tuning">')
        xml_lines.append(f'          <pitches>{" ".join(map(str, trk["tuning"]))}</pitches>')
        xml_lines.append('        </property>')
        xml_lines.append(f'        <property name="CapoFret"><int>{trk.get("capo", 0)}</int></property>')
        xml_lines.append('        <property name="TrackMute"><bool>false</bool></property>')
        xml_lines.append('        <property name="TrackSolo"><bool>false</bool></property>')
        xml_lines.append('      </properties>')
        xml_lines.append('      <staves>')
        xml_lines.append('        <staff>')
        xml_lines.append('          <properties>')
        xml_lines.append(f'            <property name="CapoFret"><int>{trk.get("capo", 0)}</int></property>')
        xml_lines.append(f'            <property name="Tuning"><pitches>{" ".join(map(str, trk["tuning"]))}</pitches></property>')
        xml_lines.append('          </properties>')
        xml_lines.append('        </staff>')
        xml_lines.append('      </staves>')
        xml_lines.append('    </track>')

    xml_lines.extend([
        '  </tracks>',
        '  <masterbars>'
    ])

    for mb in masterbars_data:
        xml_lines.append(f'    <masterbar id="{mb["id"]}">')
        xml_lines.append(f'      <time>{mb.get("time", "4/4")}</time>')
        xml_lines.append(f'      <bars>{" ".join(map(str, mb["bars"]))}</bars>')
        if "section" in mb and mb["section"] is not None:
            xml_lines.append(f'      <section id="{mb["section"]}" />')
        xml_lines.append('    </masterbar>')

    xml_lines.extend([
        '  </masterbars>',
        '  <bars>'
    ])

    # Bars, voices, beats, notes, rhythms
    all_bars = []
    all_voices = []
    all_beats = []
    all_notes = []
    all_rhythms = []
    rhythm_map = {}

    def get_rhythm_id(note_value, tuplet=None):
        key = (note_value, tuplet)
        if key not in rhythm_map:
            rid = len(all_rhythms)
            rhythm_map[key] = rid
            all_rhythms.append({"id": rid, "noteValue": note_value, "tuplet": tuplet})
        return rhythm_map[key]

    for mb in masterbars_data:
        for trk_idx, bar_info in enumerate(mb["track_bars"]):
            bar_id = len(all_bars)
            voice_ids = []
            for voice_info in bar_info["voices"]:
                voice_id = len(all_voices)
                beat_ids = []
                for beat_info in voice_info["beats"]:
                    beat_id = len(all_beats)
                    r_id = get_rhythm_id(beat_info["rhythm"], beat_info.get("tuplet"))
                    note_ids = []
                    for note_info in beat_info.get("notes", []):
                        note_id = len(all_notes)
                        all_notes.append({
                            "id": note_id,
                            "fret": note_info["fret"],
                            "string": note_info["string"],
                            "tie": note_info.get("tie", False),
                            "hopo": note_info.get("hopo", False),
                            "bend": note_info.get("bend"),
                            "slide": note_info.get("slide"),
                            "palmMute": note_info.get("palmMute", False),
                            "vibrato": note_info.get("vibrato", False)
                        })
                        note_ids.append(note_id)
                    all_beats.append({
                        "id": beat_id,
                        "rhythm": r_id,
                        "notes": note_ids,
                        "chord": beat_info.get("chord"),
                        "text": beat_info.get("text"),
                        "palmMute": beat_info.get("palmMute", False),
                        "pickStroke": beat_info.get("pickStroke")
                    })
                    beat_ids.append(beat_id)
                all_voices.append({"id": voice_id, "beats": beat_ids})
                voice_ids.append(voice_id)
            all_bars.append({"id": bar_id, "voices": voice_ids})

    for bar in all_bars:
        xml_lines.append(f'    <bar id="{bar["id"]}">')
        xml_lines.append(f'      <voices>{" ".join(map(str, bar["voices"]))}</voices>')
        xml_lines.append('    </bar>')

    xml_lines.extend([
        '  </bars>',
        '  <voices>'
    ])

    for v in all_voices:
        xml_lines.append(f'    <voice id="{v["id"]}">')
        xml_lines.append(f'      <beats>{" ".join(map(str, v["beats"]))}</beats>')
        xml_lines.append('    </voice>')

    xml_lines.extend([
        '  </voices>',
        '  <rhythms>'
    ])

    for r in all_rhythms:
        xml_lines.append(f'    <rhythm id="{r["id"]}">')
        xml_lines.append(f'      <noteValue>{r["noteValue"]}</noteValue>')
        if r.get("tuplet"):
            xml_lines.append(f'      <primaryTuplet num="{r["tuplet"][0]}" den="{r["tuplet"][1]}"/>')
        xml_lines.append('    </rhythm>')

    xml_lines.extend([
        '  </rhythms>',
        '  <beats>'
    ])

    for b in all_beats:
        xml_lines.append(f'    <beat id="{b["id"]}">')
        xml_lines.append(f'      <rhythm ref="{b["rhythm"]}" />')
        if b["notes"]:
            xml_lines.append(f'      <notes>{" ".join(map(str, b["notes"]))}</notes>')
        if b.get("chord") or b.get("text") or b.get("palmMute") or b.get("pickStroke"):
            xml_lines.append('      <properties>')
            if b.get("chord"):
                xml_lines.append(f'        <property name="Chord"><string><![CDATA[{b["chord"]}]]></string></property>')
            if b.get("text"):
                xml_lines.append(f'        <property name="FreeText"><string><![CDATA[{b["text"]}]]></string></property>')
            if b.get("palmMute"):
                xml_lines.append('        <property name="PalmMute"><bool>true</bool></property>')
            if b.get("pickStroke"):
                xml_lines.append(f'        <property name="PickStroke"><string>{b["pickStroke"]}</string></property>')
            xml_lines.append('      </properties>')
        xml_lines.append('    </beat>')

    xml_lines.extend([
        '  </beats>',
        '  <notes>'
    ])

    for n in all_notes:
        xml_lines.append(f'    <note id="{n["id"]}">')
        xml_lines.append('      <properties>')
        xml_lines.append(f'        <property name="Fret"><int>{n["fret"]}</int></property>')
        xml_lines.append(f'        <property name="String"><int>{n["string"]}</int></property>')
        if n.get("tie"):
            xml_lines.append('        <property name="Tie"><bool>true</bool></property>')
        if n.get("hopo"):
            xml_lines.append('        <property name="HopoOrigin"><bool>true</bool></property>')
        if n.get("bend"):
            xml_lines.append('        <property name="Bend">')
            xml_lines.append('          <bendType>Bend</bendType>')
            xml_lines.append(f'          <points>{n["bend"]}</points>')
            xml_lines.append('        </property>')
        if n.get("slide"):
            xml_lines.append(f'        <property name="Slide"><string>{n["slide"]}</string></property>')
        if n.get("palmMute"):
            xml_lines.append('        <property name="PalmMute"><bool>true</bool></property>')
        if n.get("vibrato"):
            xml_lines.append('        <property name="Vibrato"><string>Slight</string></property>')
        xml_lines.append('      </properties>')
        xml_lines.append('    </note>')

    xml_lines.extend([
        '  </notes>',
        '</gpif>'
    ])

    gpif_content = "\n".join(xml_lines)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr("VERSION", "7.0\n")
        z.writestr("Content/score.gpif", gpif_content)
        z.writestr("Content/Preferences.json", json.dumps({"metronome": True, "countIn": False}, indent=2))
        z.writestr("BinaryStylesheet", b"\x00\x01\x00\x00")

    print(f"Created {output_path} ({len(gpif_content)} bytes XML)")


# 1. Acoustic Fingerpicking Sample (Am - C - G - D progression)
# Standard Tuning: 40 (E2), 45 (A2), 50 (D3), 55 (G3), 59 (B3), 64 (E4)
# Strings in GPIF: 0=High E (64), 1=B (59), 2=G (55), 3=D (50), 4=A (45), 5=Low E (40)
acoustic_tracks = [
    {
        "id": 0,
        "name": "Acoustic Guitar (Fingerstyle)",
        "tuning": [40, 45, 50, 55, 59, 64],
        "capo": 0,
        "color": "255,140,0"
    }
]

acoustic_sections = [
    {"id": 0, "name": "Intro", "text": "Fingerpicking pattern"},
    {"id": 1, "name": "Verse 1", "text": "Arpeggiated chords"}
]

# 8 Bars: Am, C/G, G, D/F#, Fmaj7, C, Dsus4, Am
chords_seq = [
    ("Am", [
        {"fret": 0, "string": 4}, # A string open
        {"fret": 2, "string": 3}, # D string 2nd fret (E)
        {"fret": 2, "string": 2}, # G string 2nd fret (A)
        {"fret": 1, "string": 1}, # B string 1st fret (C)
        {"fret": 0, "string": 0}, # High E open
        {"fret": 1, "string": 1},
        {"fret": 2, "string": 2},
        {"fret": 2, "string": 3},
    ]),
    ("C", [
        {"fret": 3, "string": 4}, # C (A string 3rd fret)
        {"fret": 2, "string": 3}, # E (D string 2nd fret)
        {"fret": 0, "string": 2}, # G open
        {"fret": 1, "string": 1}, # C (B string 1st fret)
        {"fret": 0, "string": 0}, # High E open
        {"fret": 1, "string": 1},
        {"fret": 0, "string": 2},
        {"fret": 2, "string": 3},
    ]),
    ("G", [
        {"fret": 3, "string": 5}, # G (Low E 3rd fret)
        {"fret": 2, "string": 4}, # B (A string 2nd fret)
        {"fret": 0, "string": 3}, # D open
        {"fret": 0, "string": 2}, # G open
        {"fret": 3, "string": 1}, # D (B string 3rd fret)
        {"fret": 3, "string": 0}, # G (High E 3rd fret)
        {"fret": 3, "string": 1},
        {"fret": 0, "string": 2},
    ]),
    ("D/F#", [
        {"fret": 2, "string": 5}, # F# (Low E 2nd fret)
        {"fret": 0, "string": 3}, # D open
        {"fret": 2, "string": 2}, # A (G string 2nd fret)
        {"fret": 3, "string": 1}, # D (B string 3rd fret)
        {"fret": 2, "string": 0}, # F# (High E 2nd fret)
        {"fret": 3, "string": 1},
        {"fret": 2, "string": 2},
        {"fret": 0, "string": 3},
    ]),
    ("Fmaj7", [
        {"fret": 3, "string": 3}, # F (D string 3rd fret)
        {"fret": 2, "string": 2}, # A (G string 2nd fret)
        {"fret": 1, "string": 1}, # C (B string 1st fret)
        {"fret": 0, "string": 0}, # E (High E open)
        {"fret": 1, "string": 1},
        {"fret": 2, "string": 2},
        {"fret": 3, "string": 3},
        {"fret": 0, "string": 0},
    ]),
    ("C", [
        {"fret": 3, "string": 4},
        {"fret": 2, "string": 3},
        {"fret": 0, "string": 2},
        {"fret": 1, "string": 1},
        {"fret": 0, "string": 0},
        {"fret": 1, "string": 1},
        {"fret": 0, "string": 2},
        {"fret": 2, "string": 3},
    ]),
    ("Dsus4", [
        {"fret": 0, "string": 3},
        {"fret": 2, "string": 2},
        {"fret": 3, "string": 1},
        {"fret": 3, "string": 0}, # G (High E 3rd fret)
        {"fret": 2, "string": 0, "hopo": True}, # D pull-off to 2nd fret
        {"fret": 3, "string": 1},
        {"fret": 2, "string": 2},
        {"fret": 0, "string": 3},
    ]),
    ("Am", [
        {"fret": 0, "string": 4},
        {"fret": 2, "string": 3},
        {"fret": 2, "string": 2},
        {"fret": 1, "string": 1},
        {"fret": 0, "string": 0},
        {"fret": 1, "string": 1},
        {"fret": 2, "string": 2},
        {"fret": 0, "string": 4},
    ])
]

acoustic_masterbars = []
for i, (chord_name, notes) in enumerate(chords_seq):
    beats = []
    for j, n in enumerate(notes):
        beat = {
            "rhythm": "Eighth",
            "notes": [n]
        }
        if j == 0:
            beat["chord"] = chord_name
        beats.append(beat)
    
    sec_id = 0 if i == 0 else (1 if i == 4 else None)
    acoustic_masterbars.append({
        "id": i,
        "time": "4/4",
        "bars": [i],
        "section": sec_id,
        "track_bars": [
            {
                "voices": [
                    {"beats": beats}
                ]
            }
        ]
    })

create_sample_gp(
    "/home/sidell/dev/music_int/samples/acoustic_fingerstyle.gp",
    "Acoustic Horizon",
    "Cadence Ensemble",
    76,
    acoustic_tracks,
    acoustic_sections,
    acoustic_masterbars,
    []
)

# 2. Rock Riff Sample (2 Tracks: Electric Guitar & Bass)
rock_tracks = [
    {
        "id": 0,
        "name": "Electric Guitar (Lead/Riff)",
        "tuning": [40, 45, 50, 55, 59, 64],
        "capo": 0,
        "color": "220,50,50"
    },
    {
        "id": 1,
        "name": "Electric Bass",
        "tuning": [28, 33, 38, 43], # E1, A1, D2, G2
        "capo": 0,
        "color": "50,120,220"
    }
]

rock_sections = [
    {"id": 0, "name": "Main Riff", "text": "Heavy overdrive"},
    {"id": 1, "name": "Chorus", "text": "Full band power chords"}
]

# 4 Bars of rock riff
rock_masterbars = []
g_bar0_beats = [
    {"rhythm": "Quarter", "chord": "E5", "notes": [{"fret": 0, "string": 5}, {"fret": 2, "string": 4}]},
    {"rhythm": "Eighth", "palmMute": True, "notes": [{"fret": 0, "string": 5, "palmMute": True}]},
    {"rhythm": "Eighth", "palmMute": True, "notes": [{"fret": 0, "string": 5, "palmMute": True}]},
    {"rhythm": "Quarter", "chord": "G5", "notes": [{"fret": 3, "string": 5}, {"fret": 5, "string": 4}]},
    {"rhythm": "Quarter", "chord": "A5", "notes": [{"fret": 5, "string": 5}, {"fret": 7, "string": 4}]}
]
b_bar0_beats = [
    {"rhythm": "Quarter", "notes": [{"fret": 0, "string": 3}]},
    {"rhythm": "Eighth", "notes": [{"fret": 0, "string": 3}]},
    {"rhythm": "Eighth", "notes": [{"fret": 0, "string": 3}]},
    {"rhythm": "Quarter", "notes": [{"fret": 3, "string": 3}]},
    {"rhythm": "Quarter", "notes": [{"fret": 5, "string": 3}]}
]

g_bar1_beats = [
    {"rhythm": "Quarter", "chord": "E5", "notes": [{"fret": 0, "string": 5}, {"fret": 2, "string": 4}]},
    {"rhythm": "Quarter", "chord": "D5", "notes": [{"fret": 5, "string": 4}, {"fret": 7, "string": 3}]},
    {"rhythm": "Quarter", "chord": "A5", "notes": [{"fret": 0, "string": 4}, {"fret": 2, "string": 3}]},
    {"rhythm": "Quarter", "notes": [{"fret": 12, "string": 2, "bend": "0 0, 60 100, 120 100", "vibrato": True}]}
]
b_bar1_beats = [
    {"rhythm": "Quarter", "notes": [{"fret": 0, "string": 3}]},
    {"rhythm": "Quarter", "notes": [{"fret": 5, "string": 2}]},
    {"rhythm": "Quarter", "notes": [{"fret": 0, "string": 2}]},
    {"rhythm": "Quarter", "notes": [{"fret": 7, "string": 2}]}
]

g_bar2_beats = [
    {"rhythm": "Quarter", "chord": "C5", "notes": [{"fret": 3, "string": 4}, {"fret": 5, "string": 3}]},
    {"rhythm": "Quarter", "chord": "D5", "notes": [{"fret": 5, "string": 4}, {"fret": 7, "string": 3}]},
    {"rhythm": "Half", "chord": "E5", "notes": [{"fret": 0, "string": 5}, {"fret": 2, "string": 4}]}
]
b_bar2_beats = [
    {"rhythm": "Quarter", "notes": [{"fret": 3, "string": 2}]},
    {"rhythm": "Quarter", "notes": [{"fret": 5, "string": 2}]},
    {"rhythm": "Half", "notes": [{"fret": 0, "string": 3}]}
]

g_bar3_beats = [
    {"rhythm": "Eighth", "notes": [{"fret": 12, "string": 1}]},
    {"rhythm": "Eighth", "notes": [{"fret": 15, "string": 1, "hopo": True}]},
    {"rhythm": "Eighth", "notes": [{"fret": 12, "string": 0}]},
    {"rhythm": "Eighth", "notes": [{"fret": 15, "string": 0, "bend": "0 0, 60 100, 120 100"}]},
    {"rhythm": "Quarter", "notes": [{"fret": 12, "string": 0, "vibrato": True}]},
    {"rhythm": "Quarter", "chord": "E5", "notes": [{"fret": 0, "string": 5}, {"fret": 2, "string": 4}]}
]
b_bar3_beats = [
    {"rhythm": "Quarter", "notes": [{"fret": 7, "string": 1}]},
    {"rhythm": "Quarter", "notes": [{"fret": 5, "string": 1}]},
    {"rhythm": "Quarter", "notes": [{"fret": 3, "string": 1}]},
    {"rhythm": "Quarter", "notes": [{"fret": 0, "string": 3}]}
]

bars_data_pairs = [
    (g_bar0_beats, b_bar0_beats),
    (g_bar1_beats, b_bar1_beats),
    (g_bar2_beats, b_bar2_beats),
    (g_bar3_beats, b_bar3_beats)
]

for i, (g_b, b_b) in enumerate(bars_data_pairs):
    sec_id = 0 if i == 0 else (1 if i == 2 else None)
    rock_masterbars.append({
        "id": i,
        "time": "4/4",
        "bars": [i * 2, i * 2 + 1],
        "section": sec_id,
        "track_bars": [
            {"voices": [{"beats": g_b}]},
            {"voices": [{"beats": b_b}]}
        ]
    })

create_sample_gp(
    "/home/sidell/dev/music_int/samples/electric_rock_riff.gp",
    "Neon Overdrive",
    "The Thunderbolts",
    128,
    rock_tracks,
    rock_sections,
    rock_masterbars,
    []
)
