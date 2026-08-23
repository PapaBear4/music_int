# 🎸 Guitar Pro Reader & Music Visualizer

A modern, high-fidelity **Guitar Pro (.gp, .gpx, .gpif)** reader, visualizer, and universal converter. It transforms proprietary binary and XML Guitar Pro archives into human-readable representations, interactive playable web scores, ASCII tablature, ChordPro lead sheets, SVG chord diagrams, and Unified Music Schema (UMS) JSON.

---

## 🌟 Key Features

### 1. 🎼 Interactive Web Application
* **AlphaTab Interactive Player:** High-performance SVG score & tablature rendering with real-time SoundFont synthesizer playback, metronome, loop control, zoom, and playback speed adjustment.
* **ASCII Tablature Generator:** Produces clean, monospace text tabs with configurable bars-per-row wrap, section headers, tempo/tuning headers, and techniques (bends, slides, hammer-ons, pull-offs, palm mutes, dead notes).
* **ChordPro Lead Sheet Exporter:** Formats chord charts with standard `[Chord]` inline brackets and section annotations (`{title}`, `{artist}`, `{tempo}`, `{sop}`, `{eop}`).
* **Chord Diagram Visualizer:** Automatically detects chord voicings and renders scalable SVG fretboard diagrams with fingering, barre marks, open strings, and muted strings.
* **Song Summary & Structure Analysis:** Displays complete song metadata, key signatures, master bar structure, tempo changes, and track breakdowns.
* **UMS (Unified Music Schema) JSON:** Converts score and track hierarchy into a normalized JSON data model for interoperability.
* **Raw GPIF XML Inspector:** View and inspect extracted XML score nodes with syntax highlighting.
* **File I/O:** Drag-and-drop or upload `.gp`, `.gpx`, `.gp5`, `.gp4`, `.gp3`, `.gpif`, or `.xml` files, with instant export (Copy, Download `.txt`/`.pro`/`.json`, Print).
* **Preloaded Demo Samples:** Instant one-click testing with *Acoustic Horizon* (Fingerstyle) and *Neon Overdrive* (Rock Riff).

### 2. 🐍 Python Headless CLI (`gp_reader.py`)
* Zero external Python dependencies (uses Python 3 standard library: `zipfile`, `xml.etree.ElementTree`, `argparse`, `json`).
* Fast batch extraction and conversion directly in terminal pipelines.
* Supports multi-track filtering, customizable line wrapping, and multiple export targets.

### 3. 📚 Comprehensive Music Format Specifications
* In-depth reference guides for **Guitar Pro**, **UMS (Unified Music Schema)**, **MusicXML**, **MIDI**, **ChordPro**, **OnSong**, and **Power Tab (PTB)**.

---

## 🚀 Getting Started & Launch Instructions

### Prerequisites
* **Python 3.8+** (installed on most Linux/macOS systems)
* Modern web browser (Chrome, Firefox, Safari, Edge)

---

### 🌐 Method 1: Launch the Web Visualizer

1. Start the built-in HTTP server from the project root:
   ```bash
   python3 -m http.server 8000 --directory web
   ```

   *(Alternatively, using Node.js `npx serve web -l 8000`)*

2. Open your browser and navigate to:
   ```text
   http://localhost:8000
   ```

3. **Try it out:**
   * Click **Acoustic Horizon** or **Neon Overdrive** in the header to load demo songs.
   * Or click **Open .gp File** (or drag & drop) to load any `.gp` / `.gpx` file.
   * Switch between the tabs: **Visual Score**, **ASCII Tablature**, **Lead Sheet (ChordPro)**, **Song Summary**, **UMS / JSON**, and **Raw XML**.

---

### 💻 Method 2: Use the Python CLI (`gp_reader.py`)

Run headless conversions directly from your terminal:

```bash
# Print ASCII Tablature to stdout (default)
python3 gp_reader.py samples/acoustic_fingerstyle.gp

# Format with custom bars-per-row wrap (e.g. 4 bars per line)
python3 gp_reader.py samples/acoustic_fingerstyle.gp -w 4

# Export Lead Sheet in ChordPro format
python3 gp_reader.py samples/acoustic_fingerstyle.gp -f chordpro -o song.pro

# Export Song Summary & Structure in Markdown
python3 gp_reader.py samples/acoustic_fingerstyle.gp -f summary

# Export Unified Music Schema (UMS) JSON
python3 gp_reader.py samples/acoustic_fingerstyle.gp -f json -o song_ums.json

# List all tracks in a multi-track score
python3 gp_reader.py samples/electric_rock_riff.gp --list-tracks

# Select a specific track (e.g., track index 1)
python3 gp_reader.py samples/electric_rock_riff.gp -t 1 -f ascii
```

#### CLI Options Reference
| Flag | Description | Default |
|------|-------------|---------|
| `file` | Path to `.gp`, `.gpx`, or `.gpif` file | *(Required)* |
| `-f, --format` | Output format: `ascii`, `summary`, `chordpro`, `json`, `xml` | `ascii` |
| `-t, --track` | Track index to process (0-indexed) | `0` |
| `-w, --wrap` | Bars per row in ASCII tab output | `2` |
| `-o, --output` | Output filepath to write to instead of stdout | `stdout` |
| `--list-tracks` | Lists track names, tunings, and capo positions | `false` |

---

### 🛠 Method 3: Regenerate Sample Files

To rebuild or create new test Guitar Pro `.gp` archives:

```bash
python3 create_samples.py
```

This compiles sample files into both `samples/` and `web/samples/`.

---

## 📂 Project Structure

```text
music_int/
├── README.md                      # Project documentation and quickstart
├── gp_reader.py                   # Python CLI reader & converter (zero-dep)
├── create_samples.py              # Script to generate valid GP7/8 test archives
│
├── web/                           # Web application frontend
│   ├── index.html                 # Main web app layout and controls
│   ├── style.css                  # Dark-mode modern responsive design
│   ├── js/
│   │   ├── app.js                 # UI orchestration, state, and event handling
│   │   ├── gp_parser.js           # Client-side GPIF XML & ZIP parser
│   │   ├── ascii_tab_generator.js # Monospace text tab engine with techniques
│   │   ├── chordpro_generator.js  # ChordPro lead sheet compiler
│   │   ├── chord_diagrams.js      # SVG chord fretboard renderer
│   │   └── ums_converter.js       # Unified Music Schema (UMS) JSON converter
│   └── samples/                   # Web-accessible demo .gp files
│       ├── acoustic_fingerstyle.gp
│       └── electric_rock_riff.gp
│
├── samples/                       # CLI test samples
│   ├── acoustic_fingerstyle.gp
│   └── electric_rock_riff.gp
│
└── *.md (Specifications)          # Architecture & format reference docs
    ├── gp_description.md          # Guitar Pro format documentation
    ├── ums_description.md         # Unified Music Schema documentation
    ├── chordpro_description.md    # ChordPro format specifications
    ├── midi_description.md        # MIDI format specifications
    ├── musicxml_description.md    # MusicXML format specifications
    ├── onsong_description.md      # OnSong format specifications
    └── ptb_description.md         # Power Tab (PTB) format specifications
```

---

## 🎼 Supported Formats

| Format | Extension | Web Visualizer | Python CLI |
|--------|-----------|:--------------:|:----------:|
| Guitar Pro 7 & 8 | `.gp` | ✅ Full | ✅ Full |
| Guitar Pro 6 | `.gpx` | ✅ Via AlphaTab | ✅ XML GPIF |
| Raw GPIF Score | `.gpif`, `.xml` | ✅ Full | ✅ Full |
| Guitar Pro 3, 4, 5 | `.gp3`, `.gp4`, `.gp5` | ✅ Via AlphaTab | — |

---

## 📜 License

MIT License. Open for development, educational, and commercial music tooling.
