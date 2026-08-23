# Power Tab Format Data Specification (.ptb)

## 1. Format Architecture & Core Data Model

Power Tab (`.ptb`) is a proprietary binary file format developed by Roy McCoy in 1999 for **Power Tab Editor**, a widely used guitar and bass tablature authoring tool. It was the primary free alternative to Guitar Pro throughout the late 1990s and 2000s.

Unlike modern ZIP/XML architectures (Guitar Pro 6–8) or human-readable plain text (ChordPro), a `.ptb` file is a monolithic binary stream serialized sequentially using Microsoft Foundation Class (MFC) `CArchive` serialization rules.

### Conceptual Binary Layout

```text
[Power Tab File Stream (.ptb)]
├── [Header Block] (Version Identifier & Validation Magic Bytes)
├── [Song Header Metadata] (Title, Artist, Composer, Transcriber, Copyright)
├── [Global Song Properties] (Key Signature, Initial Tempo, Rehearsal Signs)
├── [Chord Diagram Registry] (Name, Frets, Base Fret, Fingerings, Formula)
├── [Track Definitions (1 to 7 Tracks)]
│   ├── Instrument Parameters (MIDI Patch, Volume, Pan, Transposition)
│   └── Tuning System (String Count: 3 to 7, Pitches per String)
└── [Section Array (Section 1 to N)]
    └── [Staff System Array (System 1 to M)]
        └── [Position/Rhythm Array]
            ├── [Rhythmic Events] (Duration, Tuplet Ratios)
            ├── [Notation Symbols] (Key/Time Changes, Dynamic Markings)
            └── [Note Data Matrix] (String Index, Fret Number, Articulations)
```

---

## 2. Primitive Binary Data Types

All multi-byte integers in `.ptb` files are serialized in Little-Endian byte order:

| Data Type | Byte Length | Encoding / Format Description |
| :--- | :--- | :--- |
| `BYTE` | 1 byte | Unsigned 8-bit integer ($0 \dots 255$). |
| `WORD` | 2 bytes | Unsigned 16-bit Little-Endian integer. |
| `DWORD` | 4 bytes | Unsigned 32-bit Little-Endian integer. |
| `SHORT` | 2 bytes | Signed 16-bit Little-Endian integer. |
| `LONG` | 4 bytes | Signed 32-bit Little-Endian integer. |
| `FLOAT` | 4 bytes | IEEE 754 Single-Precision Floating-Point value. |
| `MFC String` | Variable | String prefixed by an MFC length byte (or 3-byte sequence if length $>254$), followed by ASCII/8-bit character data without null termination. |

---

## 3. Stream Structure & Section Taxonomy

### A. Header & Magic Verification

The file begins with an 8-byte magic string verifying format compliance:

$$\text{Magic Bytes: } \texttt{0x50 0x54 0x41 0x42 0x01 0x00 0x00 0x00} \quad (\text{"PTAB" + version flags})$$

Followed by an integer declaring the software build version (e.g., 1.0 or 1.7).

### B. Header Metadata

Sequentially serialized MFC Strings containing global song properties:

```text
[Title String]
[Artist String]
[Release/Album String]
[Composer String]
[Arranger String]
[Transcriber String]
[Copyright Notice String]
[Notes / Instructions Text String]
```

### C. Chord Diagram Registry (Chord Registry)

Power Tab stores explicit chord diagrams in a central lookup table. Notes in measures reference these definitions via integer indices (`chord_id`).

```text
[Chord Registry Count: WORD]
└── For each entry:
    ├── Chord Name: MFC String (e.g., "Bm7", "C/G")
    ├── Base Fret: BYTE (1 = 1st fret, 5 = 5th fret, etc.)
    ├── Fret Array: 6 x BYTE (fret numbers, 255/0xFF = Muted/Unplayed 'x')
    └── Modifications Bitfield: WORD (Barre flags, explicit fingering markers)
```

### D. Track / Instrument Definitions (Score Staves)

Power Tab uses a **dual-score architecture** with exactly **2 independent score staves** per file:
1. **Guitar Score**: The primary treble instrument staff (standard or alternate tuning).
2. **Bass Score**: The secondary bass instrument staff.

Each score stave is not a "track" in the multi-track DAW sense — rather, each stave has its own independent staff systems, position arrays, and note streams. The two staves share the same global timeline (sections, tempos, key signatures) but are otherwise self-contained.

Each score stave record contains:
- **Track Name**: `MFC String`.
- **MIDI Sound Patch**: `BYTE` ($0 \dots 127$, mapping to General MIDI instrument patches).
- **Volume / Pan / Reverb / Chorus**: `BYTE` values ($0 \dots 127$).
- **Capo Offset**: `BYTE` (Fret position, $0 = \text{no capo}$).
- **String Count**: `BYTE` ($3 \dots 7$ strings supported).
- **Tuning Array**: Array of `BYTE` values defining string pitches in MIDI pitch numbers ($0 \dots 127$).

### E. Measure, Rhythm, & Note Data Model

Power Tab groups measures into **Staff Systems** (horizontal notation bands containing top and bottom staves, e.g., Rhythm Guitar and Lead Guitar).

#### 1. Rhythmic Position (Position Event)

A single tick in time along a staff line. Holds duration values and note collections.
- **Duration Bitfield (`DWORD`)**:
  - Bits $0 \dots 3$: Basic duration ($0 = \text{Whole}$, $1 = \text{Half}$, $2 = \text{Quarter}$, $3 = \text{Eighth}$, $4 = \text{16th}$, $5 = \text{32nd}$, $6 = \text{64th}$).
  - Bit 4: Dotted note flag.
  - Bit 5: Double dotted note flag.
  - Bits $6 \dots 8$: Tuplet ratio ($0 = \text{None}$, $1 = \text{Triplet}$, $2 = \text{Quintuplet}$, etc.).
- **Beam & Tie Flags**: Bitfield indicating beam starts/ends and ties.

#### 2. Individual Note Entry (Note Event)

Nested inside a Position Event:

```text
[String Index: BYTE] (0 to 6, where 0 = Lowest pitch string)
[Fret Number: BYTE] (0 to 30, where 0 = Open string)
[Dynamic Level: BYTE] (0 = ppp, 1 = pp, 2 = p, 3 = mp, 4 = mf, 5 = f, 6 = ff, 7 = fff)
[Articulation Bitfield: DWORD]
```

#### Articulation Bitfield Allocation (`DWORD`):

| Bit Offset | Articulation Feature | Description |
| :--- | :--- | :--- |
| `0x00000001` | **Hammer-On** | Legato hammer-on from preceding note. |
| `0x00000002` | **Pull-Off** | Legato pull-off to following note. |
| `0x00000004` | **Shift Slide** | Slide into pitch with pick re-strike. |
| `0x00000008` | **Legato Slide** | Smooth slide into pitch without re-strike. |
| `0x00000010` | **Bend** | Pitch bend (points to Bend Detail sub-record). |
| `0x00000020` | **Vibrato** | Standard finger vibrato. |
| `0x00000040` | **Wide Vibrato** | Wide/tremolo arm vibrato. |
| `0x00000080` | **Palm Mute** | Palm-muted strike (PM). |
| `0x00000100` | **Natural Harmonic** | Light touch over fret wire (NH). |
| `0x00000200` | **Artificial Harmonic** | Pinched or tapped harmonic (AH/PH). |
| `0x00000400` | **Muted / Dead Note** | Muted string strike (x). |
| `0x00000800` | **Ghost Note** | Parenthesized note (fret). |
| `0x00001000` | **Trill** | Rapid alternating trill. |
| `0x00002000` | **Tap** | Right-hand fingerboard tap (T). |

---

## 4. Formal Syntax Grammar (EBNF)

Below is the Context-Free Grammar (EBNF) representing the serialized block layout of a Power Tab stream:

```ebnf
PTBFile           ::= Header ChunkSection SongMetadata ChordRegistry TrackRegistry SectionArray ;

Header            ::= MagicBytes VersionInt ;
MagicBytes        ::= "PTAB" 0x01 0x00 0x00 0x00 ;
VersionInt        ::= WORD ;

SongMetadata      ::= Title Artist Album Composer Arranger Transcriber Copyright Notes ;
Title             ::= MFCString ;
Artist            ::= MFCString ;
Album             ::= MFCString ;
Composer          ::= MFCString ;
Arranger          ::= MFCString ;
Transcriber       ::= MFCString ;
Copyright         ::= MFCString ;
Notes             ::= MFCString ;

ChordRegistry     ::= ChordCount ( ChordDefinition )* ;
ChordCount        ::= WORD ;
ChordDefinition   ::= ChordName BaseFret FretArray FingerArray ;
ChordName         ::= MFCString ;
BaseFret          ::= BYTE ;
FretArray         ::= BYTE BYTE BYTE BYTE BYTE BYTE ;
FingerArray       ::= BYTE BYTE BYTE BYTE BYTE BYTE ;

TrackRegistry     ::= TrackCount ( TrackDefinition )* ;
TrackCount        ::= BYTE ;
TrackDefinition   ::= TrackName MidiPatch Volume Pan Capo StringCount TuningArray ;
TrackName         ::= MFCString ;
MidiPatch         ::= BYTE ;
Volume            ::= BYTE ;
Pan               ::= BYTE ;
Capo              ::= BYTE ;
StringCount       ::= BYTE ;
TuningArray       ::= ( BYTE )+ ;

SectionArray      ::= SectionCount ( Section )* ;
SectionCount      ::= WORD ;
Section           ::= SectionHeader SystemArray ;
SectionHeader     ::= SectionName KeySignature Tempo ;
SectionName       ::= MFCString ;
KeySignature      ::= BYTE ;
Tempo             ::= WORD ;

SystemArray       ::= SystemCount ( StaffSystem )* ;
SystemCount       ::= WORD ;
StaffSystem       ::= PositionArray ;

PositionArray     ::= PositionCount ( PositionEvent )* ;
PositionCount     ::= WORD ;
PositionEvent     ::= DurationBitfield NoteCount ( NoteEvent )* ;
DurationBitfield  ::= DWORD ;
NoteCount         ::= BYTE ;

NoteEvent         ::= StringIndex FretNumber DynamicLevel ArticulationFlags ;
StringIndex       ::= BYTE ;
FretNumber        ::= BYTE ;
DynamicLevel      ::= BYTE ;
ArticulationFlags ::= DWORD ;

MFCString         ::= LengthByte ( ASCIIChar )* ;
LengthByte        ::= BYTE ;
ASCIIChar         ::= [0-9a-zA-Z _\-!@#$%^&*()+=/\\.,<>?;:'"\[\]{}] ;
```

---

## 5. Native Abstract JSON Schema Data Model

Below is a pure JSON Schema model reflecting a parsed `.ptb` file structure:

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
        "composer": { "type": "string" },
        "transcriber": { "type": "string" },
        "copyright": { "type": "string" },
        "notes": { "type": "string" }
      }
    },
    "chord_registry": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "base_fret": { "type": "integer", "default": 1 },
          "frets": {
            "type": "array",
            "items": { "type": "integer" },
            "minItems": 6,
            "maxItems": 6
          }
        },
        "required": ["name", "frets"]
      }
    },
    "tracks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "name": { "type": "string" },
          "midi_patch": { "type": "integer" },
          "string_count": { "type": "integer" },
          "capo": { "type": "integer", "default": 0 },
          "tuning_midi_pitches": {
            "type": "array",
            "items": { "type": "integer" }
          }
        },
        "required": ["id", "name", "midi_patch", "string_count", "tuning_midi_pitches"]
      }
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "tempo_bpm": { "type": "number" },
          "key_signature": { "type": "string" },
          "positions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "duration_type": { "type": "string" },
                "is_dotted": { "type": "boolean", "default": false },
                "tuplet_ratio": { "type": "string" },
                "notes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "string_index": { "type": "integer" },
                      "fret": { "type": "integer" },
                      "dynamic": { "type": "string" },
                      "articulations": {
                        "type": "object",
                        "properties": {
                          "hammer_on": { "type": "boolean", "default": false },
                          "pull_off": { "type": "boolean", "default": false },
                          "bend": { "type": "boolean", "default": false },
                          "slide": { "type": "boolean", "default": false },
                          "vibrato": { "type": "boolean", "default": false },
                          "palm_mute": { "type": "boolean", "default": false },
                          "ghost_note": { "type": "boolean", "default": false },
                          "dead_note": { "type": "boolean", "default": false }
                        }
                      }
                    },
                    "required": ["string_index", "fret"]
                  }
                }
              },
              "required": ["duration_type", "notes"]
            }
          }
        },
        "required": ["positions"]
      }
    }
  },
  "required": ["metadata", "chord_registry", "tracks", "sections"]
}
```
