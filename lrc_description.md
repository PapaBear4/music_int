# Time-Synchronized Lyrics & Musical Data Specifications

## 1. The LRC Format (.lrc) Data Specification

The LRC format (developed by Chih-Chung Chang) is a plain-text, line-based format used for synchronizing text (lyrics) with audio playback timelines using millisecond-accurate timestamps.

### A. Data Hierarchy & Structure

```text
[LRC Document]
├── [ID Tag / Metadata Registry] ({[key: value]})
└── [Timestamp Event Array]
    └── [Timed Line]
        ├── [Time Tag(s)] ([mm:ss.xx])
        ├── [Extended Word/Syllable Time Tags] (<mm:ss.xx>) (Enhanced LRC)
        └── [Lyric String Content]
```

### B. Header / ID Tag Metadata Taxonomy

ID tags are placed at the beginning of the document enclosed in square brackets `[key:value]`.

| Tag | Parameter Type | Description / Example |
| :--- | :--- | :--- |
| `[ti: ...]` | String | Song Title. (`[ti: Hotel California]`) |
| `[ar: ...]` | String | Performing Artist. (`[ar: Eagles]`) |
| `[al: ...]` | String | Album Name. (`[al: Hotel California]`) |
| `[au: ...]` | String | Songwriter / Author. (`[au: Don Henley, Glenn Frey]`) |
| `[by: ...]` | String | Creator / Transcriber of the LRC file. (`[by: Cadence Ingestion Engine]`) |
| `[offset: ...]` | Signed Integer | Global millisecond adjustment offset (+/- ms). (`[offset: +250]`) |
| `[length: ...]` | String | Total audio track length (mm:ss). (`[length: 06:30]`) |
| `[re: ...]` | String | Application or player that generated the file. (`[re: Cadence Sync Tool]`) |
| `[ve: ...]` | String | File syntax version. (`[ve: 2.0]`) |

### C. Time Tag Formats & Variants

Timestamp tags take the syntax `[mm:ss.xx]` or `[mm:ss.xxx]`:
- **`mm`**: Minute count (2 digits, 00–99).
- **`ss`**: Second count (2 digits, 00–59).
- **`xx`**: Hundredths of a second (2 digits, 00–99, where `.50` = 500 ms).
- **`xxx`**: Milliseconds (3 digits, 000–999).

#### 1. Standard Simple LRC (Line-Level Sync)

Each line begins with a single timestamp marker anchoring the entire text line:

```lrc
[00:14.20]On a dark desert highway
[00:18.50]Cool wind in my hair
[00:22.10]Warm smell of colitas
[00:26.40]Rising up through the air
```

#### 2. Compact / Multi-Tag LRC (Repeated Lines)

Multiple timestamp tags can precede a single text string if lyrics repeat identically at different points in the track:

```lrc
[01:12.30][03:45.10]Welcome to the Hotel California
[01:18.00][03:50.80]Such a lovely place, such a lovely face
```

#### 3. Enhanced LRC (Word / Syllable Level Sync)

Extended LRC embeds inner word timestamps enclosed in angle brackets `<mm:ss.xx>` within the line string:

```lrc
[00:14.20]On <00:14.50>a <00:14.80>dark <00:15.30>desert <00:16.10>highway,
[00:18.50]cool <00:19.10>wind <00:19.70>in <00:20.10>my <00:20.60>hair
```

### D. Formal Context-Free Grammar (EBNF) for LRC

```ebnf
LRCDocument   ::= ( HeaderLine | TimedLine | EmptyLine )* ;

HeaderLine    ::= "[" HeaderKey ":" HeaderValue "]" Newline ;
HeaderKey     ::= "ti" | "ar" | "al" | "au" | "by" | "offset" | "length" | "re" | "ve" ;
HeaderValue   ::= [^\]\r\n]+ ;

TimedLine     ::= ( LineTimeTag )+ ( WordTimedText | TextSegment )* Newline ;
LineTimeTag   ::= "[" Minute ":" Second "." Fraction "]" ;
WordTimeTag   ::= "<" Minute ":" Second "." Fraction ">" ;

Minute        ::= Digit Digit ;
Second        ::= Digit Digit ;
Fraction      ::= Digit Digit ( Digit )? ;
Digit         ::= [0-9] ;

TextSegment   ::= [^<\[\r\n]+ ;
WordTimedText ::= WordTimeTag TextSegment ;
Newline       ::= "\n" | "\r\n" ;
```

### E. Native JSON Schema Model for LRC

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "artist": { "type": "string" },
        "album": { "type": "string" },
        "offset_ms": { "type": "integer", "default": 0 },
        "length": { "type": "string" }
      },
      "additionalProperties": { "type": "string" }
    },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "timestamps_ms": {
            "type": "array",
            "items": { "type": "integer" }
          },
          "text": { "type": "string" },
          "words": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "timestamp_ms": { "type": "integer" },
                "word": { "type": "string" }
              },
              "required": ["timestamp_ms", "word"]
            }
          }
        },
        "required": ["timestamps_ms", "text"]
      }
    }
  },
  "required": ["metadata", "lines"]
}
```

---

## 2. Other Crucial Formats in the Music Engine Ecosystem

Beyond Guitar Pro, ChordPro, and LRC, three other standardized file formats represent key data layers in digital sheet music, notation, and timing engine ecosystems:

```text
+-----------------------------------------------------------------------------------+
| Multi-Format Data Matrix                                                          |
|                                                                                   |
|  ├── LRC (.lrc)             --> Plain-text lyric-to-audio timestamp alignments    |
|  ├── MusicXML (.musicxml)   --> XML interchange format for formal sheet notation  |
|  ├── Standard MIDI (.mid)   --> Binary performance event data & polyphonic timing |
|  └── WebVTT (.vtt) / SRT    --> Subtitle time-stamped text streams                |
+-----------------------------------------------------------------------------------+
```

### A. MusicXML (.musicxml, .xml, .mxl)

MusicXML is an open, XML-based data format designed by Recordare (now maintained by W3C) for exchanging digital sheet music between score writers (Sibelius, Finale, MuseScore, Dorico).
- **Structure**: Uncompressed XML or compressed PKZip archives (`.mxl`).
- **Core Entity Model**:
  - `<score-partwise>`: Measures are primary containers; instruments are nested inside measures.
  - `<score-timewise>`: Instruments are primary containers; measures are nested inside instruments.
- **Data Payload**: Pitch octaves (`<pitch><step>C</step><octave>4</octave></pitch>`), explicit note durations (`<duration>`), stem directions, beam groupings, staves, ties, and dynamic markings.

```xml
<note>
  <pitch>
    <step>G</step>
    <octave>4</octave>
  </pitch>
  <duration>4</duration>
  <type>quarter</type>
  <notations>
    <articulations>
      <staccato/>
    </articulations>
  </notations>
</note>
```

### B. Standard MIDI File (.mid, .midi)

Standard MIDI (Musical Instrument Digital Interface) files store event-based performance data rather than audio waveforms or page visual layout drawings.
- **Format**: Binary byte stream structured in chunks:
  - **Header Chunk (`MThd`)**: File format type (Format 0 single-track, Format 1 multi-track), track count, and delta-time division resolution (PPQN - Pulses Per Quarter Note).
  - **Track Chunks (`MTrk`)**: Sequential arrays of Delta-Time offsets followed by MIDI Events.
- **Core Event Types**:
  - **Note On (`0x90`)**: Channel, Pitch Number ($0\dots127$), Velocity ($0\dots127$).
  - **Note Off (`0x80`)**: Channel, Pitch Number, Release Velocity.
  - **Control Change (`0xB0`)**: Controller ID (e.g., Sustain Pedal, Volume, Expression), Value.
  - **Program Change (`0xC0`)**: Sound patch / Instrument assignment.
  - **Meta Events (`0xFF`)**: Set Tempo (`0x51`), Time Signature (`0x58`), Key Signature (`0x59`), Lyrics (`0x05`).

### C. WebVTT (.vtt) & SubRip (.srt)

WebVTT (Web Video Text Tracks) and SRT are standard caption/subtitle formats used when syncing video frames or streaming media players to text lines.

```webvtt
WEBVTT

00:00:14.200 --> 00:00:18.400
On a dark desert highway,

00:00:18.500 --> 00:00:22.000
cool wind in my hair
```

- **Data Model**: Sequential "cues" defined by explicit Start Timestamp $\rightarrow$ End Timestamp boundaries, carrying plain text or HTML-like styling tags (`<b>`, `<i>`, `<c.color>`).
