# MusicXML Format Data Specification (.musicxml, .xml, .mxl)

## 1. Format Architecture & Core Data Model

MusicXML is an open, XML-based digital sheet music interchange standard maintained by the W3C Music Notation Community Group. It represents formal music notation, scores, tablatures, and performance attributes.

MusicXML documents exist in two primary physical representations:
- **Uncompressed XML (`.musicxml` or `.xml`)**: Standard UTF-8 XML document.
- **Compressed Container (`.mxl`)**: A PKZip archive containing the root XML score document and a `META-INF/container.xml` manifest declaring the document root path.

### Conceptual Data Hierarchy (partwise)

```text
[MusicXML Score Document]
├── [Score Header] (Work Title, Composer, Rights, Encoding Software)
├── [Part List Registry] (Instrument Staves, MIDI Programs, Sound Channels)
└── [Part Array] (Sequential array of individual instrument parts)
    └── [Measure Array] (Chronological measures within a part)
        ├── [Attributes] (Key, Time Signature, Clef, Divisions, Tuning)
        ├── [Direction Array] (Tempo, Dynamics, Words, Rehearsal Marks)
        └── [Note Array] (Pitches, Durations, Voices, Notations, Ties, Tabs)
```

---

## 2. Top-Level Root Paradigms: Partwise vs. Timewise

MusicXML defines two top-level schema layouts:

### A. Partwise Schema (`<score-partwise>`) — Industry Standard

Measures are nested inside parts. This is the dominant layout used by sheet music engines (Finale, Sibelius, MuseScore, Dorico).

$$\text{Score} \longrightarrow \text{Parts} \longrightarrow \text{Measures} \longrightarrow \text{Notes}$$

```xml
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Lead Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note>...</note>
    </measure>
  </part>
</score-partwise>
```

### B. Timewise Schema (`<score-timewise>`)

Parts are nested inside measures. This layout is used for time-synchronous multi-track matrix processing.

$$\text{Score} \longrightarrow \text{Measures} \longrightarrow \text{Parts} \longrightarrow \text{Notes}$$

```xml
<score-timewise version="4.0">
  <measure number="1">
    <part id="P1">
      <note>...</note>
    </part>
  </measure>
</score-timewise>
```

> [!NOTE]
> W3C maintains standard XSLT stylesheets (`parttime.xsl` and `timepart.xsl`) to convert losslessly between the two formats.

---

## 3. Detailed Node Definitions & Element Taxonomy

### A. Document Header & Identification (`<work>`, `<identification>`)

Stores metadata regarding the piece, composers, transcribers, and copyright terms.

```xml
<work>
  <work-title>Hotel California</work-title>
</work>
<identification>
  <creator type="composer">Don Henley, Glenn Frey, Don Felder</creator>
  <creator type="lyricist">Don Henley</creator>
  <rights>© 1976 Cass County Music</rights>
  <encoding>
    <software>Cadence MusicXML Engine</software>
    <encoding-date>2026-08-08</encoding-date>
  </encoding>
</identification>
```

### B. Part List Table (`<part-list>`)

Registers participating instruments/staves and assigns unique string identifiers (`id`).

```xml
<part-list>
  <score-part id="P1">
    <part-name>Acoustic Guitar</part-name>
    <part-abbreviation>Gtr.</part-abbreviation>
    <score-instrument id="P1-I1">
      <instrument-name>Steel String Guitar</instrument-name>
    </score-instrument>
    <midi-instrument id="P1-I1">
      <midi-channel>1</midi-channel>
      <midi-program>26</midi-program> <!-- MIDI Patch: Acoustic Guitar (steel) -->
    </midi-instrument>
  </score-part>
</part-list>
```

### C. Measure Attributes (`<attributes>`)

Defines the musical parameters of a measure. Shifts in key, tempo, or time signature are declared inside the measure where the change takes place.
- **`<divisions>`**: Integer specifying temporal resolution (ticks/pulses per quarter note).
- **`<key>`**: Key signature defined by fifths relative to C ($0 = \text{C/Am}$, $1 = \text{G/Em}$, $-1 = \text{F/Dm}$).
- **`<time>`**: Time signature numerator (`<beats>`) and denominator (`<beat-type>`).
- **`<clef>`**: Notation clef (G on line 2 for Treble, F on line 4 for Bass, TAB for Tablature).
- **`<staff-details>`**: Specifies staff line count and tuning pitches for stringed instruments.

```xml
<attributes>
  <divisions>4</divisions> <!-- 4 divisions per quarter note (1 div = 16th note) -->
  <key>
    <fifths>2</fifths> <!-- 2 sharps = D Major / B Minor -->
    <mode>minor</mode>
  </key>
  <time>
    <beats>4</beats>
    <beat-type>4</beat-type>
  </time>
  <clef>
    <sign>G</sign>
    <line>2</line>
  </clef>
  <staff-details>
    <staff-lines>6</staff-lines>
    <staff-tuning line="1">
      <tuning-step>E</tuning-step>
      <tuning-octave>2</tuning-octave>
    </staff-tuning>
    <staff-tuning line="2">
      <tuning-step>A</tuning-step>
      <tuning-octave>2</tuning-octave>
    </staff-tuning>
    <staff-tuning line="3">
      <tuning-step>D</tuning-step>
      <tuning-octave>3</tuning-octave>
    </staff-tuning>
    <staff-tuning line="4">
      <tuning-step>G</tuning-step>
      <tuning-octave>3</tuning-octave>
    </staff-tuning>
    <staff-tuning line="5">
      <tuning-step>B</tuning-step>
      <tuning-octave>3</tuning-octave>
    </staff-tuning>
    <staff-tuning line="6">
      <tuning-step>E</tuning-step>
      <tuning-octave>4</tuning-octave>
    </staff-tuning>
  </staff-details>
</attributes>
```

### D. Note, Pitch, Chord & Tablature Elements (`<note>`)

The `<note>` element represents pitches, rests, chords, and guitar tablature data.

#### Fields Overview:
- **`<pitch>`**:
  - `<step>`: Note name (A, B, C, D, E, F, G).
  - `<alter>`: Chromatic shift ($-1 = \text{flat}$, $0 = \text{natural}$, $1 = \text{sharp}$).
  - `<octave>`: Scientific pitch octave integer ($0 \dots 9$).
- **`<duration>`**: Integer duration measured in units defined by `<divisions>`.
- **`<type>`**: Symbolic duration (whole, half, quarter, eighth, 16th, 32nd).
- **`<voice>`**: Polyphonic voice channel integer ($1 \dots 4$).
- **`<chord>`**: Flag element indicating this note sounds simultaneously with the preceding note.
- **`<rest>`**: Flag element indicating a rest rather than a sounded pitch.
- **`<notations>`**: Articulations, ties, slurs, and guitar-specific technical data:
  - `<technical><string>`: String index ($1 = \text{high e}$, $6 = \text{low E}$).
  - `<technical><fret>`: Integer fret position ($0 \dots 24$).
  - `<technical><pull-off>` / `<technical><hammer-on>`: Legato articulations.
  - `<technical><bend>`: Bend pitch-time envelope offset parameters.

```xml
<!-- Standard Note with Tablature Annotations -->
<note>
  <pitch>
    <step>F</step>
    <alter>1</alter>
    <octave>4</octave>
  </pitch>
  <duration>2</duration> <!-- Eighth note (when divisions = 4) -->
  <type>eighth</type>
  <voice>1</voice>
  <stem>up</stem>
  <notations>
    <technical>
      <string>1</string> <!-- 1st string (High E) -->
      <fret>2</fret> <!-- 2nd fret = F#4 -->
    </technical>
  </notations>
</note>

<!-- Chord Note (Played simultaneously with note above) -->
<note>
  <chord/>
  <pitch>
    <step>D</step>
    <octave>4</octave>
  </pitch>
  <duration>2</duration>
  <type>eighth</type>
  <voice>1</voice>
  <notations>
    <technical>
      <string>2</string> <!-- 2nd string (B) -->
      <fret>3</fret>   <!-- 3rd fret = D4 -->
    </technical>
  </notations>
</note>
```

### E. Directions, Expressions & Performance Markings (`<direction>`)

Stores non-note events attached to the timeline: tempo markings, dynamic signs, rehearsal letters, and textual annotations.

```xml
<direction placement="above">
  <direction-type>
    <metronome>
      <beat-unit>quarter</beat-unit>
      <per-minute>147</per-minute>
    </metronome>
  </direction-type>
  <sound tempo="147"/>
</direction>

<direction placement="below">
  <direction-type>
    <dynamics>
      <mf/> <!-- Mezzo-forte dynamic marking -->
    </dynamics>
  </direction-type>
</direction>
```

### F. Chord Symbols & Harmonic Analysis (`<harmony>`)

The `<harmony>` element represents chord symbols placed above the staff — distinct from individual `<note>` elements. This is the primary element for chord-chart and lead-sheet data.

#### Fields Overview:
- **`<root>`**: The chord root note.
  - `<root-step>`: Note name (A–G).
  - `<root-alter>`: Chromatic adjustment ($-1 = \text{flat}$, $1 = \text{sharp}$).
- **`<kind>`**: Chord quality/type string. Common values include: `major`, `minor`, `dominant`, `diminished`, `augmented`, `suspended-second`, `suspended-fourth`, `major-seventh`, `minor-seventh`, `dominant-ninth`, etc.
- **`<bass>`**: Optional bass note for slash chords (e.g., C/G).
  - `<bass-step>`: Bass note name.
  - `<bass-alter>`: Chromatic adjustment.
- **`<degree>`**: Optional chord alterations and extensions (added, altered, or subtracted intervals).
  - `<degree-value>`: Scale degree integer (e.g., `9`, `11`, `13`).
  - `<degree-alter>`: Chromatic shift of the degree.
  - `<degree-type>`: One of `add`, `alter`, or `subtract`.
- **`<offset>`**: Integer offset in `<divisions>` units, positioning the chord change within the measure relative to the preceding `<note>` or `<forward>` element.

```xml
<!-- Bm7 chord symbol -->
<harmony>
  <root>
    <root-step>B</root-step>
  </root>
  <kind>minor-seventh</kind>
</harmony>

<!-- C/G slash chord -->
<harmony>
  <root>
    <root-step>C</root-step>
  </root>
  <kind>major</kind>
  <bass>
    <bass-step>G</bass-step>
  </bass>
</harmony>

<!-- Dominant 7 with added sharp 9 -->
<harmony>
  <root>
    <root-step>E</root-step>
  </root>
  <kind text="7#9">dominant</kind>
  <degree>
    <degree-value>9</degree-value>
    <degree-alter>1</degree-alter>
    <degree-type>add</degree-type>
  </degree>
</harmony>
```

> [!NOTE]
> The `<harmony>` element is placed in the measure timeline alongside `<note>` and `<direction>` elements. Its position in the sequence determines when the chord change occurs. For chord-chart ingestion, `<harmony>` elements are often the primary data source, with `<note>` elements being secondary or absent.

---

## 4. Formal Syntax Grammar (EBNF)

Below is the Context-Free Grammar (EBNF) representing the core partwise MusicXML document tree:

```ebnf
ScorePartwise   ::= Header Identification PartList Part+ ;
Header          ::= ( Work | MovementTitle )? ;
PartList        ::= "<part-list>" ScorePart+ "</part-list>" ;
ScorePart       ::= "<score-part id=\"" PartID "\">" PartName ( Instrument | MidiInst )* "</score-part>" ;

Part            ::= "<part id=\"" PartID "\">" Measure+ "</part>" ;
Measure         ::= "<measure number=\"" MeasureNumber "\">" MeasureElement* "</measure>" ;
MeasureElement  ::= Attributes | Direction | Note | Harmony ;

Attributes      ::= "<attributes>" Divisions? Key? Time? Clef? StaffDetails? "</attributes>" ;
Divisions       ::= "<divisions>" Integer "</divisions>" ;
Key             ::= "<key>" "<fifths>" SignedInt "</fifths>" ( "<mode>" String "</mode>" )? "</key>" ;
Time            ::= "<time>" "<beats>" Int "</beats>" "<beat-type>" Int "</beat-type>" "</time>" ;

Note            ::= "<note>" ChordFlag? ( Pitch | Rest ) Duration Type Voice? Notations? "</note>" ;
ChordFlag       ::= "<chord/>" ;
Rest            ::= "<rest/>" ;
Pitch           ::= "<pitch>" "<step>" StepChar "</step>" ( "<alter>" SignedInt "</alter>" )? "<octave>" Int "</octave>" "</pitch>" ;

Duration        ::= "<duration>" Integer "</duration>" ;
Type            ::= "<type>" NoteTypeString "</type>" ;
Notations       ::= "<notations>" Technical? "</notations>" ;
Technical       ::= "<technical>" ( StringNum | FretNum | Bend | Hopo )* "</technical>" ;

Harmony         ::= "<harmony>" HarmonyRoot Kind Bass? Degree* "</harmony>" ;
HarmonyRoot     ::= "<root>" "<root-step>" StepChar "</root-step>" ( "<root-alter>" SignedInt "</root-alter>" )? "</root>" ;
Kind            ::= "<kind>" String "</kind>" ;
Bass            ::= "<bass>" "<bass-step>" StepChar "</bass-step>" ( "<bass-alter>" SignedInt "</bass-alter>" )? "</bass>" ;
Degree          ::= "<degree>" "<degree-value>" Int "</degree-value>" "<degree-alter>" SignedInt "</degree-alter>" "<degree-type>" DegreeType "</degree-type>" "</degree>" ;
DegreeType      ::= "add" | "alter" | "subtract" ;

StringNum       ::= "<string>" Int "</string>" ;
FretNum         ::= "<fret>" Int "</fret>" ;
StepChar        ::= "A" | "B" | "C" | "D" | "E" | "F" | "G" ;
```

---

## 5. Complete Abstract Data Tree (JSON Schema Model)

A fully parsed MusicXML document maps into an abstract JSON data tree model:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "composer": { "type": "string" },
        "lyricist": { "type": "string" },
        "rights": { "type": "string" },
        "encoding_software": { "type": "string" }
      }
    },
    "parts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "midi_program": { "type": "integer" },
          "measures": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "number": { "type": "integer" },
                "attributes": {
                  "type": "object",
                  "properties": {
                    "divisions": { "type": "integer" },
                    "key_fifths": { "type": "integer" },
                    "time_signature": { "type": "string" },
                    "clef": { "type": "string" },
                    "tuning": {
                      "type": "array",
                      "items": { "type": "string" }
                    }
                  }
                },
                "directions": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "tempo": { "type": "number" },
                      "dynamic": { "type": "string" },
                      "text": { "type": "string" }
                    }
                  }
                },
                "notes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "is_rest": { "type": "boolean", "default": false },
                      "is_chord": { "type": "boolean", "default": false },
                      "pitch": {
                        "type": "object",
                        "properties": {
                          "step": { "type": "string" },
                          "alter": { "type": "integer", "default": 0 },
                          "octave": { "type": "integer" }
                        }
                      },
                      "duration_ticks": { "type": "integer" },
                      "type": { "type": "string" },
                      "voice": { "type": "integer", "default": 1 },
                      "tablature": {
                        "type": "object",
                        "properties": {
                          "string": { "type": "integer" },
                          "fret": { "type": "integer" }
                        }
                      }
                    }
                  }
                },
                "harmonies": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "root": {
                        "type": "object",
                        "properties": {
                          "step": { "type": "string" },
                          "alter": { "type": "integer", "default": 0 }
                        },
                        "required": ["step"]
                      },
                      "kind": { "type": "string" },
                      "bass": {
                        "type": "object",
                        "properties": {
                          "step": { "type": "string" },
                          "alter": { "type": "integer", "default": 0 }
                        }
                      },
                      "degrees": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "value": { "type": "integer" },
                            "alter": { "type": "integer" },
                            "type": { "type": "string", "enum": ["add", "alter", "subtract"] }
                          },
                          "required": ["value", "alter", "type"]
                        }
                      }
                    },
                    "required": ["root", "kind"]
                  }
                }
              },
              "required": ["number", "notes"]
            }
          }
        },
        "required": ["id", "name", "measures"]
      }
    }
  },
  "required": ["metadata", "parts"]
}
```
