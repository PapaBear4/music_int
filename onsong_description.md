# Worship & Stage Manager Formats Data Specification (OnSong, OpenSong, OpenLyrics)

## 1. Architectural Overview

Across modern live performance software (OnSong, OpenSong, ProPresenter, OpenLP, and SongbookPro), three primary formats dominate stage lead sheets and lyric projection slides:
- **OnSong Format (`.onsong`, `.usr`)**: A line-oriented, text-based extension of ChordPro that uses line-prefix key/value metadata headers and bracketed inline chords.
- **OpenSong Format (`.xml`, `.opensong`)**: A legacy XML schema created for the open-source OpenSong application. It separates song metadata into top-level XML tags while storing the musical payload in a single `<lyrics>` block using custom line-prefix conventions (`.` for chords, ` ` for lyrics).
- **OpenLyrics Format (`.xml`)**: An open, W3C-compliant XML specification designed for interoperability between presentation and songbook software. It uses structured XML nodes for verses, chords, and transpositions without relying on line-prefix hacks.

### Architectural Comparison Matrix

```text
+-----------------------------------------------------------------------------------+
| Stage Manager Format Ecosystem                                                    |
|                                                                                   |
| ├── OnSong (.onsong)     --> Plain text with line-prefix headers & [Chords]       |
| ├── OpenSong (.opensong) --> XML metadata container wrapping line-prefix text     |
| └── OpenLyrics (.xml)    --> Pure W3C XML schema with native <chord> elements     |
+-----------------------------------------------------------------------------------+
```

---

## 2. OnSong Data Specification (.onsong)

### A. Document Hierarchy

An `.onsong` file is a UTF-8 text file consisting of three logical zones:

```text
[OnSong Document]
├── Zone 1: Title Line (Line 1)
├── Zone 2: Artist / Subtitle Line (Line 2)
├── Zone 3: Header Metadata Block (Key-value lines terminated by a blank line)
└── Zone 4: Body Sections (Verse/Chorus blocks with inline [Chords])
```

### B. Header Metadata Syntax

OnSong uses line-prefix tags at the top of the file:

```onsong
Hotel California
Eagles
Key: Bm
Tempo: 147
Time: 4/4
Capo: 2nd Fret
Book: Classic Rock, Sets 2026
Flow: V1 C V2 C B C O

Verse 1:
On a [Bm]dark desert highway, [F#7]cool wind in my hair
```

| Header Tag | Expected Data Type | Description |
| :--- | :--- | :--- |
| `Key:` | String | Key signature (e.g., `Bm`, `G#m`, `C`). |
| `Tempo:` | Integer | Beats per minute (e.g., `147`). |
| `Time:` | String | Time signature (e.g., `4/4`, `6/8`). |
| `Capo:` | String / Integer | Capo instruction (e.g., `2`, `2nd Fret`). |
| `Flow:` | Sequence String | Section sequence list (e.g., `V1 C V2 C B C`). |
| `Duration:` | Time String / Seconds | Estimated playback duration (e.g., `06:30` or `390`). |
| `MIDI:` | String / Hex | Program change or Control Change sequence for pedals. |
| `Book:` | Comma-Separated List | Setlist or category groupings. |

---

## 3. OpenSong Data Specification (.opensong)

### A. XML Schema Taxonomy

An OpenSong file is an XML document with the root node `<song>`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Hotel California</title>
  <author>Don Henley, Glenn Frey, Don Felder</author>
  <copyright>© 1976 Asylum Records</copyright>
  <hymn_number></hymn_number>
  <presentation>V1 C1 V2 C1 B C1 O</presentation>
  <ccli></ccli>
  <capo print="true">2</capo>
  <key>Bm</key>
  <aka></aka>
  <key_line></key_line>
  <user1></user1>
  <user2></user2>
  <user3></user3>
  <theme></theme>
  <tempo>147</tempo>
  <time_signature>4/4</time_signature>
  <time_signature_override></time_signature_override>
  <lyrics>
[V1]
.Bm                  F#7
 On a dark desert highway, cool wind in my hair
.A                   E
 Warm smell of colitas, rising up through the air
  </lyrics>
</song>
```

### B. The `<lyrics>` Line-Prefix System

Inside the `<lyrics>` block, lines use strict single-character prefix markers:
- **`.` (Period Prefix)**: **Chord Line**. Chords are placed on this line at exact character offsets corresponding to the lyric text line directly below it.
- **` ` (Space Prefix)**: **Lyric Line**. Standard lyric string corresponding to the chord line directly above it.
- **`[...]` (Square Bracket Line)**: **Section Header**. Declares a section tag (e.g., `[V1]`, `[C1]`, `[B]`).
- **`;` (Semicolon Prefix)**: **Comment / Instruction**. Non-rendered performance direction.
- **`-` (Hyphen Prefix)**: **Slide Break**. Forces a page/presentation slide boundary within a single verse.

---

## 4. OpenLyrics Data Specification (.xml)

### A. Schema Architecture

OpenLyrics is a strict, fully structured XML standard (`http://openlyrics.info/namespace/2009/song`). It eliminates text-level alignment hacks by nesting chords directly as XML tags (`<chord name="Bm"/>`) inside word text runs.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song"
      version="0.8"
      createdIn="Cadence Engine"
      modifiedIn="Cadence Engine"
      modifiedDate="2026-08-08T20:00:00">
  <properties>
    <titles>
      <title>Hotel California</title>
    </titles>
    <authors>
      <author>Don Henley</author>
      <author>Glenn Frey</author>
    </authors>
    <copyright>© 1976 Asylum Records</copyright>
    <key>Bm</key>
    <tempo type="bpm">147</tempo>
    <timeSignature>4/4</timeSignature>
    <verseOrder>v1 c1 v2 c1 b c1</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines>
        <line>On a <chord name="Bm"/>dark desert highway, <chord name="F#7"/>cool wind in my hair</line>
        <line><chord name="A"/>Warm smell of colitas, <chord name="E"/>rising up through the air</line>
      </lines>
    </verse>
    <verse name="c1">
      <lines>
        <line>Welcome to the <chord name="G"/>Hotel Cali<chord name="D"/>fornia</line>
      </lines>
    </verse>
  </lyrics>
</song>
```

---

## 5. Formal Context-Free Grammars (EBNF)

### A. OnSong EBNF Grammar

```ebnf
OnSongDocument  ::= TitleLine ArtistLine ( HeaderDirective )* BlankLine BodySection+ ;

TitleLine       ::= TextLine Newline ;
ArtistLine      ::= TextLine Newline ;
HeaderDirective ::= HeaderKey ":" HeaderValue Newline ;
HeaderKey       ::= "Key" | "Tempo" | "Time" | "Capo" | "Book" | "Flow" | "Duration" | "MIDI" ;
HeaderValue     ::= [^\r\n]+ ;

BodySection     ::= ( SectionLabel Newline )? ( LyricChordLine Newline )+ ;
SectionLabel    ::= [a-zA-Z0-9_ ]+ ":" ;
LyricChordLine  ::= ( TextSegment | InlineChord )+ ;
InlineChord     ::= "[" [^\]\r\n]+ "]" ;
TextSegment     ::= [^\[\r\n]+ ;

BlankLine       ::= Newline ;
Newline         ::= "\n" | "\r\n" ;
```

### B. OpenSong Lyrics Block EBNF Grammar

```ebnf
OpenSongLyrics  ::= ( SectionHeader | ChordLine | LyricLine | CommentLine | SlideBreak | EmptyLine )* ;

SectionHeader   ::= "[" [a-zA-Z0-9]+ "]" Newline ;
ChordLine       ::= "." [^\r\n]* Newline ;
LyricLine       ::= " " [^\r\n]* Newline ;
CommentLine     ::= ";" [^\r\n]* Newline ;
SlideBreak      ::= "-" [^\r\n]* Newline ;
EmptyLine       ::= Newline ;
```

---

## 6. Unified JSON Schema Data Model (Stage Manager Imports)

This JSON Schema represents a parsed, normalized internal data tree capable of losslessly ingesting OnSong, OpenSong, or OpenLyrics files:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "source_format": {
      "type": "string",
      "enum": ["onsong", "opensong", "openlyrics"]
    },
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "artist": { "type": "string" },
        "copyright": { "type": "string" },
        "key": { "type": "string" },
        "tempo_bpm": { "type": "number" },
        "time_signature": { "type": "string" },
        "capo": { "type": "integer", "default": 0 },
        "presentation_flow": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["title"]
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["verse", "chorus", "bridge", "intro", "outro", "prechorus", "other"]
          },
          "lines": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "elements": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "type": { "type": "string", "enum": ["lyric", "chord", "comment"] },
                      "value": { "type": "string" }
                    },
                    "required": ["type", "value"]
                  }
                }
              },
              "required": ["elements"]
            }
          }
        },
        "required": ["id", "type", "lines"]
      }
    }
  },
  "required": ["source_format", "metadata", "sections"]
}
```
