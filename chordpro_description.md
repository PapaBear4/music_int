# ChordPro Format Data Specification (.cho, .pro, .chordpro)

## 1. Format Architecture & Core Data Model

The ChordPro format (`.cho`, `.pro`, `.chordpro`, `.chopro`) is a UTF-8 plain-text markup specification for representing lead sheets, chord charts, lyrics, and musical metadata.

The format relies on two fundamental syntactic constructs:
- **Directives**: Enclosed in curly braces `{directive: value}`, providing structural, metadata, chord definition, or formatting parameters.
- **Inline Annotations**: Enclosed in square brackets `[Chord]`, placed at exact character offsets within text lines to denote chord placement relative to lyrics.

### Conceptual Data Hierarchy

```text
[ChordPro Document]
├── [Metadata Registry] (Key-Value attributes: Title, Artist, Key, Tempo, etc.)
├── [Chord Definition Table] (Custom voicings: frets, fingerings, base-fret)
└── [Section Array] (Ordered collection of logical structural blocks)
    └── [Line Array] (Ordered lines within a section)
        ├── [Line Type: Metadata / Structural Directive]
        ├── [Line Type: Monospaced Tablature]
        └── [Line Type: Segmented Lyric/Chord Line]
            └── [Segment Array]
                ├── [Chord String]
                └── [Lyric Text String]
```

---

## 2. Complete Directive Taxonomy

Directives follow the syntax `{command}` (flag) or `{command: argument}` (parameterized). Directive names are case-insensitive.

### A. Metadata Directives

Store global document attributes.

| Short Name | Long Name | Data Type | Description / Example |
| :--- | :--- | :--- | :--- |
| `{t: ...}` | `{title: ...}` | String | Document main title. (`{title: Hotel California}`) |
| `{st: ...}` | `{subtitle: ...}` | String | Subtitle, version, or album name. (`{subtitle: Acoustic Version}`) |
| `{a: ...}` | `{artist: ...}` | String | Primary artist or band name. (`{artist: Eagles}`) |
| | `{composer: ...}` | String | Composer attribution. No standard short form (`{c:}` is reserved for `{comment}`). (`{composer: Don Henley, Glenn Frey}`) |
| `{ly: ...}` | `{lyricist: ...}` | String | Lyricist attribution. (`{lyricist: Bernie Taupin}`) |
| `{key: ...}` | `{key: ...}` | String | Nominal tonic key signature. (`{key: Bm}`) |
| `{tempo: ...}` | `{tempo: ...}` | Integer / Float | Tempo in beats per minute. (`{tempo: 147}`) |
| `{time: ...}` | `{time: ...}` | String | Time signature numerator/denominator. (`{time: 4/4}`) |
| `{capo: ...}` | `{capo: ...}` | Integer | Capo position in fret count. (`{capo: 2}`) |
| `{album: ...}` | `{album: ...}` | String | Album name. (`{album: Hotel California}`) |
| `{year: ...}` | `{year: ...}` | Integer | Release year. (`{year: 1976}`) |
| `{copyright: ...}` | `{copyright: ...}` | String | Copyright notice. (`{copyright: © 1976 Asylum Records}`) |
| `{meta: ...}` | `{meta: key val}` | Key-Value Pair | Arbitrary user-defined metadata tag. (`{meta: genre Rock}`) |

### B. Structural Environment Directives

Delimit explicit structural sections within the song payload.

| Environment | Start Directive | End Directive | Short Start | Short End |
| :--- | :--- | :--- | :--- | :--- |
| **Verse** | `{start_of_verse}` | `{end_of_verse}` | `{sov}` | `{eov}` |
| **Chorus** | `{start_of_chorus}` | `{end_of_chorus}` | `{soc}` | `{eoc}` |
| **Bridge** | `{start_of_bridge}` | `{end_of_bridge}` | `{sob}` | `{eob}` |
| **Tablature** | `{start_of_tab}` | `{end_of_tab}` | `{sot}` | `{eot}` |
| **Grid** | `{start_of_grid}` | `{end_of_grid}` | `{sog}` | `{eog}` |

Sections can optionally accept a label argument:

```chordpro
{start_of_verse: Verse 1}
On a [Bm]dark desert highway...
{end_of_verse}
```

### C. Formatting & Presentation Directives

Provide display and typographic instructions.

| Directive | Argument Type | Description |
| :--- | :--- | :--- |
| `{comment: ...}` / `{c: ...}` | String | Text comment or performance callout. |
| `{comment_italic: ...}` / `{ci: ...}` | String | Italicized text comment. |
| `{comment_box: ...}` / `{cb: ...}` | String | Framed comment box. |
| `{new_page}` / `{np}` | None | Document page break marker. |
| `{column_break}` | None | Layout column break marker. |
| `{grid}` / `{no_grid}` | None | Toggle display of explicit chord diagrams. |
| `{textfont: ...}` | String | Font family name for lyrics text. |
| `{textsize: ...}` | Integer / Float | Point size for lyrics text. |
| `{chordfont: ...}` | String | Font family name for chord labels. |
| `{chordsize: ...}` | Integer / Float | Point size for chord labels. |

### D. Custom / Vendor Extensions

Custom vendor directives use the prefix `{x_vendor_key: value}` to ensure parser compatibility without namespace collisions:

```chordpro
{x_vendor_difficulty: 4}
{x_vendor_tuning_notes: Drop D Tuning}
```

---

## 3. Chord Notation & Definition Mechanics

### Inline Placement Rules

Chords are represented in square brackets `[Chord]` and attached directly to string locations:
- **Syllable-Anchored**: `On a [Bm]dark desert highway` $\rightarrow$ The chord Bm is anchored to the letter 'd' in "dark".
- **Mid-Word Insertion**: `A[Am]nother one bites` $\rightarrow$ The chord Am interrupts the word between 'A' and 'n'.
- **Pure Chord Progression**: `[G] [C] [D] [G]` $\rightarrow$ Space-delimited chord markers without associated lyrics (e.g., Intro or Solo).

### The `{define}` Directive Data Structure

Custom or explicit chord voicings are declared using the `{define}` directive:

$$\text{\{define: } \textit{ChordName} \text{ frets } f_1\ f_2\ f_3\ f_4\ f_5\ f_6 \text{ fingers } g_1\ g_2\ g_3\ g_4\ g_5\ g_6 \text{ base-fret } N \text{\}}$$

```chordpro
# Standard 6-string voicing (String 6 to String 1: x 2 4 4 3 2)
{define: Bm frets x 2 4 4 3 2 fingers N 1 3 4 2 1}

# Higher-neck position using base-fret
{define: C/G frets 3 3 2 0 1 0 base-fret 1}
```

#### Field Specifications:
- **`frets`**: Array of string values representing string states from lowest pitch (String 6) to highest pitch (String 1):
  - `x` or `-`: Unplayed / muted string.
  - `0`: Open played string.
  - `1 ... 24`: Integer fret index.
- **`base-fret`**: Integer starting fret position for barre or higher-register chords (default = 1).
- **`fingers`**: Finger assignment array corresponding to each string:
  - `1` = Index, `2` = Middle, `3` = Ring, `4` = Pinky, `T` = Thumb, `N` = None/Unused.

---

## 4. Formal Syntax Grammar (EBNF)

Below is the Context-Free Grammar (EBNF) for a valid ChordPro stream:

```ebnf
Document       ::= ( Line ( Newline Line )* )? ;
Line           ::= EmptyLine | DirectiveLine | TabLine | ContentLine ;

DirectiveLine  ::= "{" DirectiveName ( ":" DirectiveValue )? "}" ;
DirectiveName  ::= [a-zA-Z0-9_]+ ;
DirectiveValue ::= [^{}\n\r]+ ;

ContentLine    ::= ( TextSegment | ChordMarker )+ ;
ChordMarker    ::= "[" ChordName "]" ;
ChordName      ::= [^\]\n\r]+ ;
TextSegment    ::= [^\[{\n\r]+ ;

TabLine        ::= [^\n\r]+ ; (* Lines enclosed between {sot} and {eot} *)
Newline        ::= "\n" | "\r\n" ;
```

---

## 5. Complete Abstract Data Tree (JSON Schema Model)

A fully parsed ChordPro document maps into a pure data structure without external dependencies:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "subtitle": { "type": "string" },
        "artist": { "type": "string" },
        "composer": { "type": "string" },
        "lyricist": { "type": "string" },
        "key": { "type": "string" },
        "tempo": { "type": "number" },
        "time": { "type": "string" },
        "capo": { "type": "integer" },
        "copyright": { "type": "string" }
      },
      "additionalProperties": { "type": "string" }
    },
    "chord_definitions": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "frets": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 6,
            "maxItems": 6
          },
          "fingers": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 6,
            "maxItems": 6
          },
          "base_fret": { "type": "integer", "default": 1 }
        },
        "required": ["frets"]
      }
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["global", "verse", "chorus", "bridge", "tab"]
          },
          "label": { "type": "string" },
          "lines": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": ["lyric_line", "tab_line", "comment"]
                },
                "content": { "type": "string" },
                "items": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "type": { "type": "string", "enum": ["lyric", "chord"] },
                      "value": { "type": "string" }
                    },
                    "required": ["type", "value"]
                  }
                }
              },
              "required": ["type"]
            }
          }
        },
        "required": ["type", "lines"]
      }
    }
  },
  "required": ["metadata", "chord_definitions", "sections"]
}
```
