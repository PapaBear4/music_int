# Modern Guitar Pro File Format Specification (.gpx & .gp)

## 1. Architectural Overview

Starting with Guitar Pro 6 (`.gpx`) and continuing through Guitar Pro 7 and 8 (`.gp`), Arobas Music abandoned the legacy sequential binary format (`.gp3`–`.gp5`) in favor of an **Open Container / XML-based Architecture**.

While legacy files required parsing raw byte offsets and bitmasks, modern Guitar Pro files use container architectures holding structured XML documents, JSON preferences, binary stylesheet parameters, and auxiliary assets:
- **Guitar Pro 6 (`.gpx`)**: Uses a proprietary **BCFS (Binary Chunk File System)** container. While conceptually similar to a ZIP archive, it requires a custom decompression/extraction routine — standard ZIP libraries will not open `.gpx` files.
- **Guitar Pro 7 and 8 (`.gp`)**: Uses standard **PKZip** archives that can be opened with any ZIP library.

```text
+-----------------------------------------------------------------------------------+
| Modern Guitar Pro File Archive (.gp / .gpx)                                       |
|                                                                                   |
| ├── VERSION               --> Archive format version descriptor                  |
| ├── Content/                                                                      |
| │   ├── score.gpif        --> Core XML document (Guitar Pro Interchange)          |
| │   └── Preferences.json  --> Session & practice tool configurations              |
| ├── BinaryStylesheet      --> Page layout, typography, & notation styles          |
| ├── PartConfiguration     --> Display mode settings per track/staff               |
| ├── LayoutConfiguration   --> Score viewing layout & zoom levels                  |
| └── Audio/ (Optional)     --> Embedded audio samples, IRs, & thumbnails           |
+-----------------------------------------------------------------------------------+
```

---

## 2. Container Structure & File Directory

Extracting a modern Guitar Pro container (unzipping for `.gp`; BCFS-decoding for `.gpx`) yields a standardized directory layout:

| File / Folder Path | Type / Format | Technical Purpose |
| :--- | :--- | :--- |
| `VERSION` | Plain Text | Contains the archive format version string (e.g., `1.0` or `2.0`). |
| `Content/score.gpif` | XML Document | **The Primary Score Payload**. Contains all musical tracks, notes, staves, measures, lyrics, automations, and RSE settings. |
| `Content/Preferences.json` | JSON | Application-level settings associated with the file (e.g., Speed Trainer step percentages, metronome offsets). |
| `BinaryStylesheet` | Custom Binary / KV | Key-value stylesheet controlling sheet layout, page margins, fonts, musical symbol sizing, and staff spacing. |
| `PartConfiguration` | Custom Binary | Dictates which tracks and staves are visible in multi-track vs. single-part score views. |
| `LayoutConfiguration` | Custom Binary | Preserves document window state, zoom percentages, and page scroll orientation (horizontal vs. vertical page view). |
| `Audio/` | Directory | Holds optional audio assets, such as custom audio sample backings, custom impulse responses (IRs), or score preview thumbnails. |

---

## 3. Deep Dive: `score.gpif` (Guitar Pro Interchange Format)

The `score.gpif` file contains a relational graph representing the entire arrangement. Rather than nesting notes directly within measures, `score.gpif` uses relational entity tables with integer identifiers (`id`).

### XML Entity Hierarchy Overview

```text
<gpif>
├── <gpversion>
├── <score>              --> Title, Artist, Album, Copyright, Transcriber
├── <mastertrack>        --> Tempo automations, key shifts, section markers
├── <tracks>             --> Instrument tracks, tunings, strings, soundbanks
├── <masterbars>         --> Primary global timeline (measures & time signatures)
├── <bars>               --> Track-specific measure instances
├── <voices>             --> Polyphonic voice lanes per measure
├── <beats>              --> Rhythmic placements, durations, chord diagrams
├── <notes>              --> Pitch details, frets, strings, articulations
└── <rhythms>            --> Rhythmic values & tuplet declarations
```

### Detailed XML Node Descriptions

#### A. Score Metadata (`<score>`)

Stores document-level metadata tags used for sheet headers and copyright tracking.

```xml
<score>
  <title><![CDATA[Stairway to Heaven]]></title>
  <subTitle><![CDATA[Led Zeppelin IV]]></subTitle>
  <artist><![CDATA[Led Zeppelin]]></artist>
  <album><![CDATA[Led Zeppelin IV]]></album>
  <words><![CDATA[Robert Plant]]></words>
  <music><![CDATA[Jimmy Page]]></music>
  <copyright><![CDATA[© 1971 Atlantic Records]]></copyright>
  <tabber><![CDATA[Transcribed by Cadence Engine]]></tabber>
  <instructions><![CDATA[Capo 7th fret for acoustic intro]]></instructions>
</score>
```

#### B. Master Track (`<mastertrack>`)

Serves as the global timeline director, hosting master automations and section markers.
- **`<Automations>` / `<automations>`**: Manages tempo changes (`Tempo`), volume swells, and dynamic accelerandos/ritardandos.
- **`<Markers>` / `<sections>`**: Section dividers (Intro, Verse 1, Solo) with assigned display colors and bar indices.

```xml
<mastertrack>
  <automations>
    <automation>
      <type>Tempo</type>
      <value>82.0 2</value> <!-- 82 BPM, quarter note reference -->
      <position>0</position>
      <linear>false</linear>
    </automation>
  </automations>
  <sections>
    <section id="0">
      <name><![CDATA[Intro]]></name>
      <text><![CDATA[Acoustic Fingerpicking]]></text>
    </section>
  </sections>
</mastertrack>
```

#### C. Tracks & Instrument Configurations (`<tracks>`)

Defines the band instrumentation. Each track element specifies:
- **`<Pitches>`**: Tuning array defining the open MIDI pitch for each string (e.g., `40 45 50 55 59 64` for Standard E tuning).
- **`<Capo>` / `<CapoFret>`**: Capo position in frets (e.g., `0` for no capo, `7` for 7th fret).
- **`<NotationMode>`**: Toggles display of standard notation, guitar tablature, slash notation, or rhythm staves.
- **`<Sounds>`**: Maps RSE (Realistic Sound Engine) plugins, soundbank patches, effect chains, and MIDI channel routing.

```xml
<track id="0">
  <name><![CDATA[Acoustic Guitar]]></name>
  <color>255,128,0</color>
  <properties>
    <property name="Tuning">
      <pitches>40 45 50 55 59 64</pitches> <!-- E2, A2, D3, G3, B3, E4 -->
    </property>
    <property name="CapoFret"><int>7</int></property>
    <property name="TrackMute"><bool>false</bool></property>
    <property name="TrackSolo"><bool>false</bool></property>
  </properties>
  <staves>
    <staff>
      <properties>
        <property name="CapoFret"><int>7</int></property>
        <property name="Tuning"><pitches>40 45 50 55 59 64</pitches></property>
      </properties>
    </staff>
  </staves>
</track>
```

#### D. Master Bars (`<masterbars>`)

Defines global measure structures across all tracks in time sequence.
- **`<Time>` / `<time>`**: Time signature numerator and denominator (e.g., `4/4` or `6/8`).
- **Repeat Flags**: Indicates repeat start/end locations and repeat counts (`<Repeat start="true" />`).
- **`<AlternateEnding>`**: Voltas for 1st/2nd endings.

```xml
<masterbar id="0">
  <time>4/4</time>
  <bars>0 1 2</bars> <!-- Points to Bar IDs across Track 0, Track 1, Track 2 -->
  <section id="0" /> <!-- Section "Intro" starts here -->
</masterbar>
```

#### E. Bars & Polyphonic Voices (`<bars>` & `<voices>`)

- **`<Bar>` / `<bar>`**: Links a specific track to a `<MasterBar>`. Points to one or more polyphonic `<Voice>` objects.
- **`<Voice>` / `<voice>`**: Supports up to 4 simultaneous rhythmic voices per measure (e.g., Voice 0 for a treble melody line, Voice 1 for a thumb bass pattern).

```xml
<bar id="0">
  <voices>0 1</voices> <!-- Polyphonic measure containing two voices -->
</bar>

<voice id="0">
  <beats>0 1 2 3</beats> <!-- Chronological beat IDs in this voice -->
</voice>
```

#### F. Rhythms (`<rhythms>`)

Consolidates rhythmic values into shared reusable definitions referenced by Beats.

```xml
<rhythm id="0">
  <noteValue>Quarter</noteValue>
</rhythm>
<rhythm id="1">
  <noteValue>Eighth</noteValue>
  <primaryTuplet num="3" den="2"/> <!-- Triplet tuplets -->
</rhythm>
```

#### G. Beats (`<beats>`)

Represents chronological rhythmic events containing note collections and beat-level expressions.
- **`<Rhythm ref="..." />`**: Points to a duration definition in `<rhythms>`.
- **`<Properties>`**: Holds beat-level articulations:
  - Palm mutes (`PalmMute`)
  - Tapping, slapping, popping (`Tapping`, `Slap`, `Pop`)
  - Pick stroke directions (`UpStrum`, `DownStrum`)
  - Rasgueado, vibrato arm bends, tremolo picking
  - Mix table automation changes (tempo/volume shifts)
- **`<Chord>`**: References chord diagrams and fingerings.

```xml
<beat id="0">
  <rhythm ref="0" /> <!-- Quarter note -->
  <notes>0 1 2</notes> <!-- Points to Note IDs played simultaneously -->
  <properties>
    <property name="PickStroke"><string>Down</string></property>
    <property name="PalmMute"><bool>true</bool></property>
  </properties>
</beat>
```

#### H. Notes (`<notes>`)

Defines exact fret positions, pitch data, and note-level articulations.
- **`<Fret>`**: Fret index (Integer, `0` to `30`).
- **`<String>`**: Zero-indexed or 1-indexed string identifier.
- **`<Properties>`**: Individual note articulations:
  - **Bends (`<Bend>`)**: Detailed array of time-pitch coordinate points ($0 = \text{no bend}$, $100 = \text{full step}$, $200 = \text{two steps}$).
  - **Slides (`<Slide>`)**: Shift slide, legato slide, slide out below/above.
  - **Legato Ties**: Hammer-on / Pull-off flags.
  - **Harmonics (`<Harmonic>`)**: Natural, Artificial, Pinch, Tap, Semi, or Feedback harmonics.
  - **Accents**: Heavy accent, ghost notes, dead notes ($x$).

```xml
<note id="0">
  <properties>
    <property name="Fret"><int>5</int></property>
    <property name="String"><int>2</int></property> <!-- 3rd string -->
    <property name="Tie"><bool>false</bool></property>
    <property name="HopoOrigin"><bool>true</bool></property> <!-- Hammer-on start -->
    <property name="Bend">
      <bendType>Bend</bendType>
      <points>0 0, 60 100, 120 100</points> <!-- Bend up 1 full step -->
    </property>
  </properties>
</note>
```

---

## 4. Modern vs. Legacy Architectural Comparison

| Feature / Dimension | Legacy Formats (`.gp3`, `.gp4`, `.gp5`) | Modern Formats (`.gpx`, `.gp`) |
| :--- | :--- | :--- |
| **Underlying Container** | Monolithic Binary File Stream | Compressed ZIP Archive Container |
| **Primary Data Serialization** | Sequential Byte Offsets & Bitwise Masks | XML Schema (`score.gpif`) + JSON + Key-Value Stylesheets |
| **Parsing Complexity** | High: Requires bitwise operations & exact offset tracking. | Low: Handled via standard ZIP decompression + XML DOM/SAX parsing. |
| **Polyphonic Voices** | Limited (Max 2 fixed voices per track in GP5). | Flexible multi-voice array per bar (`<voices>`). |
| **String / Tuning Limit** | Restricted to 4–7 strings (8 in GP5). | Supports arbitrary string counts (4–8+ strings) & custom pitch maps. |
| **Sound Synthesis Engine** | MIDI Channels & primitive RSE 1 settings. | High-fidelity RSE (Realistic Sound Engine), sample channels, and FX routing. |
| **Score Styling Controls** | Basic page margin settings. | Rich `BinaryStylesheet` key-value layout formatting engine. |

---

## 5. Practical Implementation Pattern: Parsing .gp Files

To process a `.gp` or `.gpx` file in Python, unzip the container in memory, locate `Content/score.gpif`, and parse the XML tree.

```python
import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, Any

def parse_guitar_pro_archive(file_path: str) -> ET.Element:
    """
    Decompresses a modern .gp/.gpx archive and returns the parsed score.gpif XML tree.
    """
    with zipfile.ZipFile(file_path, 'r') as gp_zip:
        # Check for modern GP7/GP8 layout first, fallback to GP6
        target_xml = None
        for filename in gp_zip.namelist():
            if filename.endswith('score.gpif'):
                target_xml = filename
                break

        if not target_xml:
            raise FileNotFoundError("Could not locate 'score.gpif' inside Guitar Pro archive.")

        with gp_zip.open(target_xml) as xml_file:
            tree = ET.parse(xml_file)
            return tree.getroot()

def extract_basic_metadata(root: ET.Element) -> Dict[str, Any]:
    """
    Extracts basic score metadata from the XML root.
    """
    score_node = root.find('score')
    metadata = {}
    if score_node is not None:
        for child in score_node:
            metadata[child.tag] = child.text if child.text else ""

    return metadata

# Example Usage
if __name__ == "__main__":
    try:
        gpif_root = parse_guitar_pro_archive("sample_song.gp")
        meta = extract_basic_metadata(gpif_root)
        print(f"Title: {meta.get('title', 'Unknown')}")
        print(f"Artist: {meta.get('artist', 'Unknown')}")
    except Exception as e:
        print(f"Parsing error: {e}")
```

---

## 6. Integration Mapping to Intermediate Representations (e.g., UMS)

When converting modern Guitar Pro files into a custom Unified Music Schema (UMS) or SongGraph:
- **Layer A (Timeline Grid)**: Map `<masterbars>` and tempo automations from `<mastertrack>` into the UMS measure array.
- **Layer B (Tablature & Chords)**: Map `<beats>` and `<notes>` from the primary guitar track. Extract frets, strings, chord diagrams, and articulations into timeline slots.
- **Layer C (Standard Notation)**: Extract pitch values, durations from `<rhythms>`, and polyphonic voice lanes (`<voices>`) for standard notation rendering.
