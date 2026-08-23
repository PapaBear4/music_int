# Standard MIDI File Format Data Specification (.mid, .midi)

## 1. Format Architecture & Core Data Model

Standard MIDI (Musical Instrument Digital Interface) File Format (SMF) is a binary, event-driven file specification for encoding musical performance data. Unlike audio waveforms (WAV, MP3) or visual page layout (MusicXML), MIDI encodes discrete **performance events** — note triggers, controller movements, tempo changes, and program selections — as timestamped commands in a compact binary stream.

The format was standardized by the MIDI Manufacturers Association (MMA) in 1983 and remains the universal interchange format for sequencers, DAWs, synthesizers, and notation software.

### Conceptual Data Hierarchy

```text
[Standard MIDI File (.mid)]
├── [Header Chunk (MThd)] (Format Type, Track Count, Timing Resolution)
└── [Track Chunk Array (MTrk)]
    └── [Track N]
        └── [Event Stream]
            ├── [Delta-Time] (Variable-Length Quantity)
            └── [Event]
                ├── [MIDI Event] (Note On/Off, Control Change, Program Change, etc.)
                ├── [SysEx Event] (Vendor-specific system exclusive data)
                └── [Meta Event] (Tempo, Time Signature, Key Signature, Lyrics, etc.)
```

---

## 2. File Format Types

SMF defines three format variants:

| Format | Name | Description |
| :--- | :--- | :--- |
| **Format 0** | Single Track | All MIDI channels interleaved into a single track chunk. Used for simple playback files. |
| **Format 1** | Multi-Track Synchronous | Multiple parallel tracks sharing a common timeline. Track 0 is typically the **tempo map** (tempo, time signature, key signature meta events). Tracks 1–N hold instrument/channel data. This is the dominant format. |
| **Format 2** | Multi-Track Asynchronous | Multiple independent track patterns, each with its own timeline. Rarely used; intended for drum machines with independent pattern banks. |

---

## 3. Binary Chunk Structure

### A. Header Chunk (`MThd`)

Every MIDI file begins with a 14-byte header chunk:

```text
Offset  Length  Field               Description
0x00    4       ChunkType           ASCII "MThd" (0x4D546864)
0x04    4       ChunkLength         Always 6 (0x00000006) — length of header data
0x08    2       FormatType          0, 1, or 2 (see Format Types above)
0x0A    2       TrackCount          Number of MTrk chunks to follow (1 for Format 0)
0x0C    2       TimeDivision        Timing resolution (see below)
```

#### Time Division Encoding:

The `TimeDivision` field determines how delta-times map to real time:

- **Bit 15 = 0**: **Ticks Per Quarter Note (PPQN)**. The remaining 15 bits specify pulses/ticks per quarter note (e.g., `0x0060` = 96 PPQN, `0x01E0` = 480 PPQN). Actual time depends on the current tempo meta event.
- **Bit 15 = 1**: **SMPTE-based timing**. Bits 14–8 encode a negative SMPTE frame rate ($-24$, $-25$, $-29$ for 29.97 drop-frame, $-30$), and bits 7–0 encode ticks per frame. Used for film/video synchronization.

### B. Track Chunks (`MTrk`)

Each track chunk contains:

```text
Offset  Length    Field           Description
0x00    4         ChunkType       ASCII "MTrk" (0x4D54726B)
0x04    4         ChunkLength     Length of track data in bytes (big-endian)
0x08    Variable  EventStream     Sequence of delta-time + event pairs
```

---

## 4. Delta-Time & Variable-Length Quantity (VLQ) Encoding

Every event is preceded by a **delta-time** value specifying the number of ticks elapsed since the previous event. Delta-times use Variable-Length Quantity (VLQ) encoding:

- Each byte uses 7 data bits (bits 6–0) and 1 continuation bit (bit 7).
- Bit 7 = 1 indicates more bytes follow; bit 7 = 0 marks the last byte.
- Values $0 \dots 127$ fit in a single byte. Larger values span 2–4 bytes.

$$\text{VLQ Example: } 128 \rightarrow \texttt{0x81 0x00} \quad (10000001\ 00000000)$$

| Decimal Value | VLQ Bytes |
| :--- | :--- |
| `0` | `0x00` |
| `127` | `0x7F` |
| `128` | `0x81 0x00` |
| `16383` | `0xFF 0x7F` |
| `16384` | `0x81 0x80 0x00` |

---

## 5. Event Taxonomy

### A. MIDI Channel Events (Voice Messages)

Channel events carry a 4-bit status nibble and a 4-bit channel number ($0 \dots 15$):

| Status Byte | Event Type | Data Bytes | Description |
| :--- | :--- | :--- | :--- |
| `0x8n` | **Note Off** | 2: Pitch ($0 \dots 127$), Velocity ($0 \dots 127$) | Releases a sounding note. |
| `0x9n` | **Note On** | 2: Pitch ($0 \dots 127$), Velocity ($0 \dots 127$) | Triggers a note. Velocity = 0 is equivalent to Note Off. |
| `0xAn` | **Polyphonic Aftertouch** | 2: Pitch, Pressure ($0 \dots 127$) | Per-note pressure change after initial strike. |
| `0xBn` | **Control Change (CC)** | 2: Controller # ($0 \dots 127$), Value ($0 \dots 127$) | Modulation, volume, pan, sustain pedal, expression, etc. |
| `0xCn` | **Program Change** | 1: Program # ($0 \dots 127$) | Selects instrument patch (General MIDI mapping). |
| `0xDn` | **Channel Aftertouch** | 1: Pressure ($0 \dots 127$) | Channel-wide pressure change. |
| `0xEn` | **Pitch Bend** | 2: LSB ($0 \dots 127$), MSB ($0 \dots 127$) | 14-bit pitch wheel value (center = 8192). |

#### Key Control Change Numbers:

| CC # | Name | Typical Use |
| :--- | :--- | :--- |
| `1` | Modulation Wheel | Vibrato / LFO depth |
| `7` | Channel Volume | Master volume per channel |
| `10` | Pan | Stereo position ($0$ = hard left, $64$ = center, $127$ = hard right) |
| `11` | Expression | Fine volume control (relative to CC 7) |
| `64` | Sustain Pedal | Damper pedal ($0 \dots 63$ = off, $64 \dots 127$ = on) |
| `91` | Reverb Depth | Effects send level |
| `93` | Chorus Depth | Effects send level |
| `121` | Reset All Controllers | Resets all CC values to defaults |
| `123` | All Notes Off | Silences all sounding notes on the channel |

#### Running Status:

To reduce file size, MIDI implements **running status**: if a channel event has the same status byte as the preceding event, the status byte may be omitted and only the data bytes are written. Parsers must track the last status byte and apply it to subsequent data-only bytes.

### B. System Exclusive (SysEx) Events

SysEx events transmit vendor-specific data:

| Start Byte | Format | Description |
| :--- | :--- | :--- |
| `0xF0` | Standard SysEx | `0xF0` + VLQ length + manufacturer ID + data payload + `0xF7` (EOX terminator). |
| `0xF7` | Escape / Continuation | Used for multi-packet SysEx or to embed arbitrary non-MIDI data. |

### C. Meta Events (`0xFF`)

Meta events encode non-performance data (tempo, time/key signatures, text, lyrics). They appear only in SMF files, not in live MIDI streams.

| Type Byte | Meta Event | Data Format | Description |
| :--- | :--- | :--- | :--- |
| `0x00` | Sequence Number | 2 bytes (uint16) | Identifies a sequence within Format 2 files. |
| `0x01` | Text Event | Variable-length UTF-8/ASCII | General-purpose text annotation. |
| `0x02` | Copyright Notice | Variable-length string | Copyright string, typically in Track 0 at delta-time 0. |
| `0x03` | Track Name | Variable-length string | Name of the track or sequence. |
| `0x04` | Instrument Name | Variable-length string | Name of the instrument assigned to the track. |
| `0x05` | Lyric | Variable-length string | Synchronized lyric text (one syllable per event). |
| `0x06` | Marker | Variable-length string | Rehearsal mark or section label (e.g., "Verse 1", "Chorus"). |
| `0x07` | Cue Point | Variable-length string | Description of a cue point for A/V synchronization. |
| `0x20` | Channel Prefix | 1 byte (channel $0 \dots 15$) | Associates subsequent meta events with a specific channel. |
| `0x2F` | End of Track | 0 bytes | **Mandatory** terminator for every MTrk chunk. |
| `0x51` | Set Tempo | 3 bytes (uint24, microseconds per quarter note) | $\text{BPM} = \frac{60{,}000{,}000}{\text{tempo\_µs}}$. Default = 500,000 µs (120 BPM). |
| `0x54` | SMPTE Offset | 5 bytes (hr, mn, sc, fr, ff) | Starting SMPTE time code for the track. |
| `0x58` | Time Signature | 4 bytes | Numerator, Denominator (as $2^n$), MIDI clocks per metronome click, 32nd notes per quarter. |
| `0x59` | Key Signature | 2 bytes | Sharps/flats ($-7 \dots +7$) and mode ($0$ = major, $1$ = minor). |
| `0x7F` | Sequencer-Specific | Variable-length | Vendor-specific sequencer data. |

#### Tempo & Time Signature Encoding Details:

**Set Tempo (`0x51`)**: The tempo value is a 24-bit unsigned integer representing microseconds per quarter note:

$$\text{µs/quarter} = \frac{60{,}000{,}000}{\text{BPM}} \quad \Longleftrightarrow \quad \text{BPM} = \frac{60{,}000{,}000}{\text{µs/quarter}}$$

Examples: 120 BPM = `0x07A120` (500,000 µs). 147 BPM = `0x063141` (408,163 µs).

**Time Signature (`0x58`)**: 4 data bytes:
- Byte 0: Numerator (e.g., `4` for 4/4, `6` for 6/8).
- Byte 1: Denominator as power of 2 (e.g., `2` = quarter note $2^2=4$, `3` = eighth note $2^3=8$).
- Byte 2: MIDI clocks per metronome click (standard: `24`).
- Byte 3: Number of 32nd notes per quarter note (standard: `8`).

---

## 6. General MIDI (GM) Instrument Patch Map

Program Change events reference the General MIDI sound set. Key instrument groups:

| Patch Range | Instrument Group | Examples |
| :--- | :--- | :--- |
| `0–7` | Piano | Acoustic Grand, Bright Piano, Electric Grand, Honky-tonk |
| `8–15` | Chromatic Percussion | Celesta, Glockenspiel, Music Box, Vibraphone, Marimba |
| `16–23` | Organ | Drawbar Organ, Percussive Organ, Rock Organ, Church Organ |
| `24–31` | Guitar | Nylon Guitar, Steel Guitar, Jazz Guitar, Clean Electric, Muted, Overdrive, Distortion |
| `32–39` | Bass | Acoustic Bass, Electric Bass (finger/pick), Fretless, Slap Bass |
| `40–47` | Strings | Violin, Viola, Cello, Contrabass, Tremolo, Pizzicato, Orchestral Harp |
| `48–55` | Ensemble | String Ensemble, Synth Strings, Choir Aahs, Voice Oohs, Orchestra Hit |
| `56–63` | Brass | Trumpet, Trombone, Tuba, Muted Trumpet, French Horn, Brass Section |
| `64–71` | Reed | Soprano Sax, Alto Sax, Tenor Sax, Baritone Sax, Oboe, English Horn, Bassoon |
| `72–79` | Pipe | Piccolo, Flute, Recorder, Pan Flute, Blown Bottle, Shakuhachi, Whistle |
| `80–95` | Synth | Square Lead, Sawtooth, Calliope, Chiff, Charang, Voice, Fifths, Bass+Lead, Pads |
| `96–111` | Effects | Rain, Soundtrack, Crystal, Atmosphere, Brightness, Goblins, Echoes, Sci-Fi |
| `112–119` | Ethnic | Sitar, Banjo, Shamisen, Koto, Kalimba, Bagpipe, Fiddle, Shanai |
| `120–127` | Percussive / SFX | Tinkle Bell, Agogo, Steel Drums, Woodblock, Taiko, Gunshot, Applause |

> [!NOTE]
> Channel 10 (index 9) is reserved for percussion in General MIDI. Note numbers on this channel map to specific drum/percussion sounds rather than pitched notes (e.g., pitch 36 = Bass Drum 1, 38 = Snare, 42 = Closed Hi-Hat).

---

## 7. Formal Syntax Grammar (EBNF)

```ebnf
MidiFile          ::= HeaderChunk TrackChunk+ ;

HeaderChunk       ::= "MThd" ChunkLength FormatType TrackCount TimeDivision ;
ChunkLength       ::= UINT32_BE ;
FormatType        ::= UINT16_BE ;       (* 0, 1, or 2 *)
TrackCount        ::= UINT16_BE ;
TimeDivision      ::= UINT16_BE ;       (* PPQN or SMPTE-based *)

TrackChunk        ::= "MTrk" ChunkLength EventStream ;
EventStream       ::= ( DeltaTime Event )* DeltaTime EndOfTrack ;

DeltaTime         ::= VLQ ;
VLQ               ::= ( ContinuationByte )* TerminalByte ;
ContinuationByte  ::= [0x80-0xFF] ;     (* Bit 7 = 1 *)
TerminalByte      ::= [0x00-0x7F] ;     (* Bit 7 = 0 *)

Event             ::= MidiEvent | SysExEvent | MetaEvent ;

MidiEvent         ::= StatusByte? DataByte DataByte? ;
StatusByte        ::= [0x80-0xEF] ;     (* Channel voice/mode messages *)
DataByte          ::= [0x00-0x7F] ;

SysExEvent        ::= ( 0xF0 | 0xF7 ) VLQ SysExData ;
SysExData         ::= DataByte* ;

MetaEvent         ::= 0xFF MetaType VLQ MetaData ;
MetaType          ::= BYTE ;
MetaData          ::= BYTE* ;

EndOfTrack        ::= 0xFF 0x2F 0x00 ;

UINT16_BE         ::= BYTE BYTE ;       (* Big-endian 16-bit unsigned *)
UINT32_BE         ::= BYTE BYTE BYTE BYTE ; (* Big-endian 32-bit unsigned *)
BYTE              ::= [0x00-0xFF] ;
```

---

## 8. Complete Abstract Data Tree (JSON Schema Model)

A fully parsed Standard MIDI file maps into an abstract JSON data tree:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "header": {
      "type": "object",
      "properties": {
        "format": { "type": "integer", "enum": [0, 1, 2] },
        "track_count": { "type": "integer" },
        "ticks_per_quarter_note": { "type": "integer" },
        "smpte_format": {
          "type": "object",
          "properties": {
            "frame_rate": { "type": "integer", "enum": [-24, -25, -29, -30] },
            "ticks_per_frame": { "type": "integer" }
          }
        }
      },
      "required": ["format", "track_count"]
    },
    "tracks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "instrument_name": { "type": "string" },
          "channel": { "type": "integer" },
          "events": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "delta_ticks": { "type": "integer" },
                "absolute_ticks": { "type": "integer" },
                "type": {
                  "type": "string",
                  "enum": [
                    "note_on", "note_off",
                    "control_change", "program_change",
                    "pitch_bend", "aftertouch", "poly_aftertouch",
                    "sysex",
                    "meta_tempo", "meta_time_signature", "meta_key_signature",
                    "meta_text", "meta_lyric", "meta_marker", "meta_cue_point",
                    "meta_track_name", "meta_instrument_name",
                    "meta_end_of_track", "meta_other"
                  ]
                },
                "channel": { "type": "integer" },
                "note": {
                  "type": "object",
                  "properties": {
                    "pitch": { "type": "integer" },
                    "velocity": { "type": "integer" }
                  }
                },
                "control_change": {
                  "type": "object",
                  "properties": {
                    "controller": { "type": "integer" },
                    "value": { "type": "integer" }
                  }
                },
                "program": { "type": "integer" },
                "pitch_bend": { "type": "integer" },
                "tempo_bpm": { "type": "number" },
                "tempo_microseconds": { "type": "integer" },
                "time_signature": {
                  "type": "object",
                  "properties": {
                    "numerator": { "type": "integer" },
                    "denominator": { "type": "integer" },
                    "clocks_per_click": { "type": "integer" },
                    "thirty_seconds_per_quarter": { "type": "integer" }
                  }
                },
                "key_signature": {
                  "type": "object",
                  "properties": {
                    "sharps_flats": { "type": "integer" },
                    "mode": { "type": "string", "enum": ["major", "minor"] }
                  }
                },
                "text": { "type": "string" }
              },
              "required": ["delta_ticks", "type"]
            }
          }
        },
        "required": ["events"]
      }
    }
  },
  "required": ["header", "tracks"]
}
```

---

## 9. Integration Mapping to Intermediate Representations (e.g., UMS)

When converting Standard MIDI files into a custom Unified Music Schema (UMS) or SongGraph:
- **Tempo Map**: Extract `Set Tempo` (`0x51`) meta events from Track 0 to build the global BPM timeline. Map to UMS `CanonicalMetadata.original_tempo_bpm` and `SectionOverrides.tempo_bpm` for mid-song changes.
- **Time & Key Signatures**: Extract `Time Signature` (`0x58`) and `Key Signature` (`0x59`) meta events for `original_time_signature` and key detection.
- **Note Events → Beat Grid**: Convert Note On/Off pairs into beat-quantized `MusicalEvent` slots using the formula: $\text{beat} = 1 + \frac{\text{tick\_in\_measure}}{\text{ticks\_per\_beat}}$.
- **Lyrics**: Extract `Lyric` (`0x05`) meta events and align them with Note On events at matching tick positions for `layer_a.lyrics`.
- **Section Markers**: Map `Marker` (`0x06`) meta events to `StructuralMap.block_name` section boundaries.
- **Program Changes**: Map to track instrument identification for multi-track ingestion.
