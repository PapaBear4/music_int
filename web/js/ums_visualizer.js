/**
 * Unified Music Schema (UMS) Interactive Visualizer Engine
 * Bridges Songsterr-style measure-quantized score cards with ChordPro lead sheets.
 */

import { renderChordSvg } from "./chord_diagrams.js";

// Note Pitch Maps for Transposition Math
const CHROMATIC_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_FLATS  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const CHORD_REGEX = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/;

// Standard Fretboard Database for Audio Voicings & Visualizer Popovers
const CHORD_VOICINGS = {
    "C":     { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1, midi: [48, 52, 55, 60, 64] },
    "C#":    { frets: [-1, 4, 3, 1, 2, 1], baseFret: 1, midi: [49, 53, 56, 61, 65] },
    "Db":    { frets: [-1, 4, 3, 1, 2, 1], baseFret: 1, midi: [49, 53, 56, 61, 65] },
    "D":     { frets: [-1, -1, 0, 2, 3, 2], baseFret: 1, midi: [50, 57, 62, 66] },
    "D#":    { frets: [-1, -1, 1, 3, 4, 3], baseFret: 1, midi: [51, 58, 63, 67] },
    "Eb":    { frets: [-1, -1, 1, 3, 4, 3], baseFret: 1, midi: [51, 58, 63, 67] },
    "E":     { frets: [0, 2, 2, 1, 0, 0], baseFret: 1, midi: [40, 47, 52, 56, 59, 64] },
    "F":     { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, midi: [41, 48, 53, 57, 60, 65] },
    "F#":    { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, midi: [42, 49, 54, 58, 61, 66] },
    "Gb":    { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, midi: [42, 49, 54, 58, 61, 66] },
    "G":     { frets: [3, 2, 0, 0, 3, 3], baseFret: 1, midi: [43, 47, 50, 55, 59, 67] },
    "G#":    { frets: [4, 6, 6, 5, 4, 4], baseFret: 4, midi: [44, 51, 56, 60, 63, 68] },
    "Ab":    { frets: [4, 6, 6, 5, 4, 4], baseFret: 4, midi: [44, 51, 56, 60, 63, 68] },
    "A":     { frets: [-1, 0, 2, 2, 2, 0], baseFret: 1, midi: [45, 52, 57, 61, 64] },
    "A#":    { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, midi: [46, 53, 58, 62, 65] },
    "Bb":    { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, midi: [46, 53, 58, 62, 65] },
    "B":     { frets: [-1, 2, 4, 4, 4, 2], baseFret: 2, midi: [47, 54, 59, 63, 66] },
    "Am":    { frets: [-1, 0, 2, 2, 1, 0], baseFret: 1, midi: [45, 52, 57, 60, 64] },
    "Bm":    { frets: [-1, 2, 4, 4, 3, 2], baseFret: 2, midi: [47, 54, 59, 62, 66] },
    "Cm":    { frets: [-1, 3, 5, 5, 4, 3], baseFret: 3, midi: [48, 55, 60, 63, 67] },
    "Dm":    { frets: [-1, -1, 0, 2, 3, 1], baseFret: 1, midi: [50, 57, 62, 65] },
    "Em":    { frets: [0, 2, 2, 0, 0, 0], baseFret: 1, midi: [40, 47, 52, 55, 59, 64] },
    "Fm":    { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, midi: [41, 48, 53, 56, 60, 65] },
    "F#m":   { frets: [2, 4, 4, 2, 2, 2], baseFret: 2, midi: [42, 49, 54, 57, 61, 66] },
    "Gm":    { frets: [3, 5, 5, 3, 3, 3], baseFret: 3, midi: [43, 50, 55, 58, 62, 67] },
    "D/F#":  { frets: [2, 0, 0, 2, 3, 2], baseFret: 1, midi: [42, 50, 57, 62, 66] },
    "Bm/D":  { frets: [-1, -1, 0, 4, 3, 2], baseFret: 1, midi: [50, 54, 59, 62, 66] },
    "F#/C#": { frets: [-1, 4, 4, 3, 2, 2], baseFret: 2, midi: [49, 54, 58, 61, 66] },
    "A7sus4":{ frets: [-1, 0, 2, 0, 3, 0], baseFret: 1, midi: [45, 52, 55, 62, 64] },
    "Em7":   { frets: [0, 2, 2, 0, 3, 0], baseFret: 1, midi: [40, 47, 52, 55, 62, 64] },
    "Bm7":   { frets: [-1, 2, 0, 2, 0, 2], baseFret: 1, midi: [47, 50, 57, 59, 66] },
    "Esus4": { frets: [0, 2, 2, 2, 0, 0], baseFret: 1, midi: [40, 47, 52, 57, 59, 64] },
    "E7":    { frets: [0, 2, 0, 1, 0, 0], baseFret: 1, midi: [40, 47, 50, 56, 59, 64] },
    "F#7":   { frets: [2, 4, 2, 3, 2, 2], baseFret: 2, midi: [42, 49, 52, 58, 61, 66] }
};

export class UmsVisualizer {
    constructor() {
        this.currentUms = null;
        this.container = null;
        this.mode = "grid"; // "grid" | "flow" | "inspector" | "json"
        this.transposeSemitones = 0;
        this.selectedCapo = 0;
        this.density = "standard"; // "compact" | "standard" | "stage"
        this.gridCols = 4; // 1, 2, 3, 4, or 'auto'
        
        // Layer Toggles
        this.showChords = true;
        this.showLyrics = true;
        this.showMiniTab = true;
        this.showBeatTicks = true;
        this.showStrumming = true;

        // Search & Filter
        this.searchQuery = "";

        // Web Audio Playback State
        this.audioCtx = null;
        this.isPlaying = false;
        this.playbackTimer = null;
        this.currentPlayMeasure = 1;
        this.currentPlayBeat = 1.0;
        this.enableMetronome = true;

        // Popover Container
        this.activePopover = null;
    }

    /**
     * Initializes or mounts the UMS Visualizer inside a container element.
     */
    mount(containerElement, umsData = null) {
        this.container = containerElement;
        if (umsData) {
            this.setUmsData(umsData);
        }
    }

    setUmsData(umsData) {
        this.currentUms = umsData;
        this.selectedCapo = umsData?.canonical?.original_capo || 0;
        this.stopAudio();
        this.render();
    }

    // --------------------------------------------------------------------------
    // Transposition Mathematics
    // --------------------------------------------------------------------------

    transposeNote(note, semitones) {
        if (!note || semitones === 0) return note;
        const scale = note.includes("b") ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
        let idx = scale.indexOf(note);
        if (idx === -1) {
            idx = (note.includes("b") ? CHROMATIC_SHARPS : CHROMATIC_FLATS).indexOf(note);
        }
        if (idx === -1) return note;
        let newIdx = (idx + semitones) % 12;
        if (newIdx < 0) newIdx += 12;
        return scale[newIdx];
    }

    transposeChord(chordName, semitones) {
        if (!chordName || semitones === 0) return chordName;
        const match = chordName.match(CHORD_REGEX);
        if (!match) return chordName;
        const root = match[1];
        const quality = match[2] || "";
        const bass = match[3] || null;

        const newRoot = this.transposeNote(root, semitones);
        const newBass = bass ? this.transposeNote(bass, semitones) : null;
        return newBass ? `${newRoot}${quality}/${newBass}` : `${newRoot}${quality}`;
    }

    getEffectiveKey() {
        const origKey = this.currentUms?.canonical?.original_key || "D";
        return this.transposeNote(origKey, this.transposeSemitones);
    }

    // --------------------------------------------------------------------------
    // Master Render Orchestrator
    // --------------------------------------------------------------------------

    render() {
        if (!this.container) return;
        if (!this.currentUms || !this.currentUms.structure) {
            this.container.innerHTML = `
                <div class="empty-conflicts-state" style="padding: 40px; text-align: center;">
                    <div class="empty-icon" style="font-size: 3rem;">🧬</div>
                    <h3 style="margin-top: 12px;">No Unified Music Schema Loaded</h3>
                    <p style="color: var(--text-muted); max-width: 500px; margin: 8px auto;">
                        Load a Guitar Pro score, lead sheet PDF, or synthesized multi-source song bundle to visualize chords, lyrics, and measures.
                    </p>
                </div>
            `;
            return;
        }

        const effectiveKey = this.getEffectiveKey();
        const tempo = this.currentUms.canonical?.original_tempo_bpm || 120;
        const title = this.currentUms.canonical?.title || "Untitled";
        const artist = this.currentUms.canonical?.artist || "Unknown Artist";
        const timeSig = this.currentUms.canonical?.original_time_signature || "4/4";
        const strum = this.currentUms.canonical?.strum_pattern || null;
        const totalMeasures = this.getTotalMeasureCount();

        let contentHtml = "";

        if (this.mode === "grid") {
            contentHtml = this.renderMeasureGridHtml();
        } else if (this.mode === "flow") {
            contentHtml = this.renderFlowingLeadSheetHtml();
        } else if (this.mode === "inspector") {
            contentHtml = this.renderInspectorHtml();
        } else if (this.mode === "json") {
            contentHtml = this.renderJsonHtml();
        }

        this.container.innerHTML = `
            <div class="ums-visualizer-wrapper density-${this.density}" id="ums-wrapper">
                
                <!-- 1. Sticky Interactive HUD Toolbar -->
                <div class="ums-toolbar">
                    <div class="ums-toolbar-group">
                        <!-- View Modes -->
                        <div class="ums-view-modes" role="tablist" aria-label="Visualizer View Mode">
                            <button class="ums-mode-btn ${this.mode === 'grid' ? 'active' : ''}" data-mode="grid" title="Songsterr-Style Measure Grid">
                                🎼 Measure Grid
                            </button>
                            <button class="ums-mode-btn ${this.mode === 'flow' ? 'active' : ''}" data-mode="flow" title="Flowing ChordPro Lead Sheet">
                                📑 Lead Sheet
                            </button>
                            <button class="ums-mode-btn ${this.mode === 'inspector' ? 'active' : ''}" data-mode="inspector" title="Tri-Layer Event Inspector">
                                🔬 Inspector
                            </button>
                            <button class="ums-mode-btn ${this.mode === 'json' ? 'active' : ''}" data-mode="json" title="Raw UMS JSON Graph">
                                🧬 Raw JSON
                            </button>
                        </div>

                        <!-- Web Audio Transport Controls -->
                        <div class="ums-transport-group">
                            <button id="ums-btn-play" class="ums-btn-transport primary" title="${this.isPlaying ? 'Pause' : 'Play Live Score'}">
                                ${this.isPlaying ? '⏸' : '▶'}
                            </button>
                            <button id="ums-btn-stop" class="ums-btn-transport" title="Stop & Reset">
                                ⏹
                            </button>
                            <span class="ums-transport-label" id="ums-bar-tracker">Bar ${this.currentPlayMeasure}</span>
                            <button id="ums-btn-metronome" class="ums-btn-transport ${this.enableMetronome ? 'primary' : ''}" title="Toggle Metronome Click" style="margin-left: 2px;">
                                🔔
                            </button>
                        </div>
                    </div>

                    <!-- Transposition & Key Dial -->
                    <div class="ums-toolbar-group">
                        <div class="ums-transpose-group">
                            <span style="color: var(--text-muted); font-size: 11px; font-weight: 600;">Key:</span>
                            <button id="ums-btn-trans-down" class="ums-transpose-btn" title="Transpose Down 1 Semitone">♭</button>
                            <span class="ums-key-pill" id="ums-key-display">${effectiveKey}${this.transposeSemitones !== 0 ? ` (${this.transposeSemitones > 0 ? '+' : ''}${this.transposeSemitones})` : ''}</span>
                            <button id="ums-btn-trans-up" class="ums-transpose-btn" title="Transpose Up 1 Semitone">♯</button>
                            <button id="ums-btn-trans-reset" class="ums-transpose-btn" title="Reset Transposition" style="font-size: 10px;">↺</button>
                        </div>

                        <!-- Layer Toggles -->
                        <div class="ums-layer-toggles">
                            <button class="ums-toggle-chip ${this.showChords ? 'active' : ''}" data-layer="chords" title="Toggle Chords Layer">
                                🎸 Chords
                            </button>
                            <button class="ums-toggle-chip ${this.showLyrics ? 'active' : ''}" data-layer="lyrics" title="Toggle Lyrics Layer">
                                🎤 Lyrics
                            </button>
                            <button class="ums-toggle-chip ${this.showMiniTab ? 'active' : ''}" data-layer="minitab" title="Toggle 6-String Mini Tab Preview">
                                🎼 Tab
                            </button>
                            <button class="ums-toggle-chip ${this.showBeatTicks ? 'active' : ''}" data-layer="beatticks" title="Toggle Beat Divisions">
                                ⏱ Beats
                            </button>
                        </div>

                        <!-- Density & Column Wraps -->
                        <select id="ums-cols-select" class="form-select form-select-sm" style="font-size: 11px; padding: 3px 6px;" title="Measures per row">
                            <option value="4" ${this.gridCols === 4 ? 'selected' : ''}>4 Bars/Row</option>
                            <option value="3" ${this.gridCols === 3 ? 'selected' : ''}>3 Bars/Row</option>
                            <option value="2" ${this.gridCols === 2 ? 'selected' : ''}>2 Bars/Row</option>
                            <option value="1" ${this.gridCols === 1 ? 'selected' : ''}>1 Bar/Row</option>
                        </select>

                        <select id="ums-density-select" class="form-select form-select-sm" style="font-size: 11px; padding: 3px 6px;" title="Visual density">
                            <option value="compact" ${this.density === 'compact' ? 'selected' : ''}>Compact</option>
                            <option value="standard" ${this.density === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="stage" ${this.density === 'stage' ? 'selected' : ''}>Stage (Large)</option>
                        </select>

                        <!-- Search & Quick Jump -->
                        <div class="ums-search-box">
                            <span class="ums-search-icon">🔍</span>
                            <input type="text" id="ums-search-input" class="ums-search-input" placeholder="Jump/Search..." value="${this.searchQuery}">
                            <button id="ums-search-clear" class="ums-search-clear ${this.searchQuery ? 'visible' : ''}">✕</button>
                        </div>
                    </div>
                </div>

                <!-- 2. Song Hero Banner -->
                <div class="ums-song-hero">
                    <div class="ums-hero-title-group">
                        <h2>
                            <span>${title}</span>
                            <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">• ${artist}</span>
                        </h2>
                        <div class="ums-hero-meta-row">
                            <div class="ums-hero-badges">
                                <span class="ums-meta-pill accent">🔑 Key: ${effectiveKey}</span>
                                <span class="ums-meta-pill">⏱ ${tempo} BPM</span>
                                <span class="ums-meta-pill">📏 ${timeSig}</span>
                                <span class="ums-meta-pill">📊 ${totalMeasures} Measures</span>
                                ${this.selectedCapo > 0 ? `<span class="ums-meta-pill">🎸 Capo ${this.selectedCapo}</span>` : ''}
                                ${strum ? `<span class="ums-meta-pill strum" title="Strum Pattern">⚡ ${strum}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="ums-hero-quick-actions">
                        <button id="ums-btn-print" class="btn btn-secondary btn-sm" title="Print score or export to clean PDF">
                            🖨 Print View
                        </button>
                    </div>
                </div>

                <!-- 3. Dynamic Mode Content -->
                <div class="ums-content-body" id="ums-content-body">
                    ${contentHtml}
                </div>

            </div>
        `;

        // Apply dynamic grid column count
        const wrapper = this.container.querySelector("#ums-wrapper");
        if (wrapper) {
            wrapper.style.setProperty("--ums-grid-cols", this.gridCols);
        }

        this.bindEvents();
    }

    getTotalMeasureCount() {
        if (!this.currentUms?.structure) return 0;
        let count = 0;
        for (const block of this.currentUms.structure) {
            count += block.measures?.length || 0;
        }
        return count;
    }

    // --------------------------------------------------------------------------
    // Mode 1: Songsterr-Style Interactive Measure Grid HTML
    // --------------------------------------------------------------------------

    renderMeasureGridHtml() {
        const structure = this.currentUms.structure || [];
        let html = "";

        structure.forEach((section, sIdx) => {
            const secName = section.block_name || section.sectionLabel || `Section ${sIdx + 1}`;
            const secClass = this.getSectionClass(secName);
            const measures = section.measures || [];
            const timeSig = section.section_overrides?.time_signature || this.currentUms.canonical?.original_time_signature || "4/4";
            const strum = section.section_overrides?.strum_pattern || null;

            // Filter measures if search query active
            const filteredMeasures = measures.filter(m => this.measureMatchesSearch(m, secName));
            if (this.searchQuery && filteredMeasures.length === 0) return;

            html += `
                <div class="ums-section-block" data-section-id="sec-${sIdx}">
                    <div class="ums-section-header" data-toggle-sec="sec-${sIdx}">
                        <div class="ums-section-header-left">
                            <span class="ums-section-tag ${secClass}">${secName}</span>
                            <span class="ums-section-meta-text">
                                ${measures.length} Bars • ${timeSig} ${strum ? `• ⚡ ${strum}` : ''}
                            </span>
                        </div>
                        <button class="ums-section-collapse-btn">▼</button>
                    </div>
                    <div class="ums-section-body">
                        <div class="ums-measure-grid">
                            ${filteredMeasures.map(m => this.renderMeasureCardHtml(m, section)).join("")}
                        </div>
                    </div>
                </div>
            `;
        });

        return html;
    }

    renderMeasureCardHtml(measure, section) {
        const mIdx = measure.measure_index || measure.measure_number || 1;
        const events = measure.musical_events || measure.events || [];
        const timeSig = measure.time_signature || section?.section_overrides?.time_signature || "4/4";
        const hasDiscrepancy = (this.currentUms.reconciliation_log || []).some(r => r.measure_number === mIdx);
        const isCurrent = this.isPlaying && this.currentPlayMeasure === mIdx;

        // Group slots by beat division or unique timestamps
        const sortedEvents = [...events].sort((a, b) => (a.beat_division || 1.0) - (b.beat_division || 1.0));
        
        // Ensure at least standard 4 beat slots for visualization if events are sparse
        const slots = sortedEvents.length > 0 ? sortedEvents : [
            { beat_division: 1.0, layer_a: { chord: null, lyrics: null } }
        ];

        return `
            <div class="ums-measure-card ${isCurrent ? 'is-playing' : ''}" data-measure-index="${mIdx}">
                <!-- Header -->
                <div class="ums-bar-header">
                    <span class="ums-bar-number-pill">Bar ${mIdx}</span>
                    <div class="ums-bar-badges-right">
                        <span class="ums-bar-timesig">${timeSig}</span>
                        ${hasDiscrepancy ? `<span class="ums-bar-discrepancy-dot" title="Discrepancy resolved in this measure"></span>` : ''}
                    </div>
                </div>

                <!-- Event Slots Grid (Chords, Beats, Lyrics) -->
                <div class="ums-events-container">
                    ${slots.map(evt => this.renderEventSlotHtml(evt, mIdx)).join("")}
                </div>

                <!-- Optional Layer B 6-String Mini Tab Staff -->
                ${this.showMiniTab ? this.renderMiniTabStaffHtml(slots) : ''}
            </div>
        `;
    }

    renderEventSlotHtml(evt, mIdx) {
        const beat = evt.beat_division || 1.0;
        const rawChord = evt.layer_a?.chord || null;
        const chord = rawChord ? this.transposeChord(rawChord, this.transposeSemitones) : null;
        const lyrics = evt.layer_a?.lyrics || null;
        const rhythm = evt.layer_b?.rhythm || "Quarter";
        const isDownbeat = (beat % 1 === 0);
        const isCurrentBeat = this.isPlaying && this.currentPlayMeasure === mIdx && Math.abs(this.currentPlayBeat - beat) < 0.3;

        const rhythmSymbol = this.getRhythmSymbol(rhythm);

        return `
            <div class="ums-event-slot ${isCurrentBeat ? 'is-active-beat' : ''}" data-beat="${beat}">
                <!-- Layer A: Chords Row -->
                ${this.showChords ? `
                    <div class="ums-slot-chord">
                        ${chord ? `
                            <button class="ums-chord-chip" data-chord="${chord}" title="View ${chord} chord fingering & sound">
                                ${chord}
                            </button>
                        ` : `<span class="ums-chord-chip empty-beat">·</span>`}
                    </div>
                ` : ''}

                <!-- Rhythmic Beat Divisions -->
                ${this.showBeatTicks ? `
                    <div class="ums-slot-rhythm">
                        <span class="ums-beat-tick">${beat.toFixed(1).replace(".0", "")}</span>
                        <span class="ums-rhythm-icon" title="${rhythm}">${rhythmSymbol}</span>
                    </div>
                ` : ''}

                <!-- Layer A: Lyrics Row -->
                ${this.showLyrics ? `
                    <div class="ums-slot-lyric">
                        ${lyrics ? `
                            <span class="ums-lyric-text ${isDownbeat ? 'downbeat' : ''} ${lyrics.endsWith('-') ? 'hyphenated' : ''}">
                                ${lyrics}
                            </span>
                        ` : `<span style="visibility:hidden">·</span>`}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderMiniTabStaffHtml(slots) {
        const stringNames = ["e", "B", "G", "D", "A", "E"]; // high E (0) to low E (5)
        
        let staffHtml = `<div class="ums-measure-minitab">`;
        
        for (let s = 0; s < 6; s++) {
            staffHtml += `
                <div class="ums-tab-string-line">
                    <span class="ums-tab-string-name">${stringNames[s]}</span>
                    <div class="ums-tab-notes-row">
                        ${slots.map(evt => {
                            const tabPositions = evt.layer_b?.tab_positions || [];
                            const hit = tabPositions.find(tp => tp.string === s);
                            if (hit !== undefined) {
                                let fVal = hit.fret;
                                if (hit.bend) fVal += "b";
                                if (hit.slide) fVal += "/";
                                return `<span class="ums-tab-fret-badge">${fVal}</span>`;
                            }
                            return `<span class="ums-tab-fret-badge empty">·</span>`;
                        }).join("")}
                    </div>
                </div>
            `;
        }

        staffHtml += `</div>`;
        return staffHtml;
    }

    // --------------------------------------------------------------------------
    // Mode 2: Flowing Lead Sheet (ChordPro Hybrid) HTML
    // --------------------------------------------------------------------------

    renderFlowingLeadSheetHtml() {
        const structure = this.currentUms.structure || [];
        let html = `<div class="ums-lead-sheet-view">`;

        structure.forEach((section, sIdx) => {
            const secName = section.block_name || section.sectionLabel || `Section ${sIdx + 1}`;
            const timeSig = section.section_overrides?.time_signature || "4/4";
            const measures = section.measures || [];

            html += `
                <div class="ums-flow-section">
                    <div class="ums-flow-section-title">
                        <span>${secName}</span>
                        <span style="font-size: 11px; font-weight: normal; color: var(--text-muted); font-family: var(--font-mono);">
                            ${measures.length} Measures • ${timeSig}
                        </span>
                    </div>
                    <div class="ums-flow-line">
            `;

            measures.forEach((m, mIdx) => {
                const barNum = m.measure_index || m.measure_number || (mIdx + 1);
                const events = m.musical_events || m.events || [];

                html += `<div class="ums-flow-bar" data-measure-index="${barNum}">`;
                html += `<span class="ums-flow-bar-num">${barNum}</span>`;

                if (events.length === 0) {
                    html += `
                        <div class="ums-flow-chord-unit">
                            <span class="ums-flow-chord-top" style="visibility:hidden">·</span>
                            <span class="ums-flow-lyric-bottom" style="color: var(--text-subtle)">[Instrumental]</span>
                        </div>
                    `;
                } else {
                    events.forEach(evt => {
                        const rawChord = evt.layer_a?.chord || null;
                        const chord = rawChord ? this.transposeChord(rawChord, this.transposeSemitones) : null;
                        const lyrics = evt.layer_a?.lyrics || "";

                        html += `
                            <div class="ums-flow-chord-unit">
                                ${chord ? `
                                    <span class="ums-flow-chord-top" data-chord="${chord}">[${chord}]</span>
                                ` : `<span class="ums-flow-chord-top" style="visibility:hidden">·</span>`}
                                <span class="ums-flow-lyric-bottom">${lyrics || (chord ? " " : "")}</span>
                            </div>
                        `;
                    });
                }

                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    }

    // --------------------------------------------------------------------------
    // Mode 3: Tri-Layer Event Inspector HTML
    // --------------------------------------------------------------------------

    renderInspectorHtml() {
        const structure = this.currentUms.structure || [];
        const allMeasures = [];
        structure.forEach(s => {
            (s.measures || []).forEach(m => {
                allMeasures.push({ section: s.block_name || "Score", measure: m });
            });
        });

        const activeM = allMeasures.find(item => item.measure.measure_index === this.currentPlayMeasure) || allMeasures[0];
        if (!activeM) return `<div style="padding: 20px;">No measures found.</div>`;

        const m = activeM.measure;
        const events = m.musical_events || m.events || [];

        return `
            <div class="ums-inspector-view">
                <!-- Sidebar Measure Selector -->
                <div class="ums-inspector-sidebar">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px;">Select Measure (${allMeasures.length} Total)</h4>
                    <div class="ums-bar-picker-list">
                        ${allMeasures.map(item => {
                            const barNum = item.measure.measure_index || 1;
                            const isSelected = barNum === (m.measure_index || 1);
                            const chordsInBar = (item.measure.events || []).map(e => e.layer_a?.chord).filter(Boolean).join(", ");
                            return `
                                <div class="ums-bar-picker-item ${isSelected ? 'active' : ''}" data-select-bar="${barNum}">
                                    <span><strong>Bar ${barNum}</strong> <small style="color: inherit; opacity: 0.8">(${item.section})</small></span>
                                    <span style="font-family: var(--font-mono); font-size: 11px;">${chordsInBar || '—'}</span>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>

                <!-- Measure Tri-Layer Deep Content -->
                <div class="ums-inspector-content">
                    <div class="ums-layer-matrix-card">
                        <div class="ums-layer-matrix-header">
                            <span>Measure ${m.measure_index || 1} — ${activeM.section}</span>
                            <span class="badge badge-info">${m.time_signature || '4/4'}</span>
                        </div>
                        <div style="padding: 16px;">
                            <table class="data-table" style="width: 100%;">
                                <thead>
                                    <tr>
                                        <th>Beat</th>
                                        <th>Layer A: Chords</th>
                                        <th>Layer A: Lyrics</th>
                                        <th>Layer B: Tabs (Fret/String)</th>
                                        <th>Layer C: Notation (Pitch/Midi)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${events.map(evt => {
                                        const chord = evt.layer_a?.chord || "—";
                                        const lyrics = evt.layer_a?.lyrics || "—";
                                        const tabStr = (evt.layer_b?.tab_positions || []).map(t => `Str ${t.string+1}: Fret ${t.fret}`).join(", ") || "—";
                                        const noteStr = (evt.layer_c?.notes || []).map(n => `${n.pitch} (${n.midi_pitch}) [${n.dynamics || 'mf'}]`).join(", ") || "—";
                                        return `
                                            <tr>
                                                <td><code>Beat ${evt.beat_division}</code></td>
                                                <td><span class="badge badge-secondary">${chord}</span></td>
                                                <td><strong>${lyrics}</strong></td>
                                                <td><code>${tabStr}</code></td>
                                                <td><span style="color: var(--accent-primary)">${noteStr}</span></td>
                                            </tr>
                                        `;
                                    }).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // --------------------------------------------------------------------------
    // Mode 4: Raw JSON Graph HTML
    // --------------------------------------------------------------------------

    renderJsonHtml() {
        const jsonStr = JSON.stringify(this.currentUms, null, 2);
        return `
            <div class="code-container" style="max-height: 650px; overflow: auto; border: 1px solid var(--border-main); border-radius: var(--radius-md);">
                <pre class="code-block json-code" style="padding: 16px; margin: 0; font-family: var(--font-mono); font-size: 12px; line-height: 1.5;">${this.escapeHtml(jsonStr)}</pre>
            </div>
        `;
    }

    // --------------------------------------------------------------------------
    // Event Listeners & Interactive Handlers
    // --------------------------------------------------------------------------

    bindEvents() {
        if (!this.container) return;

        // 1. Mode Switches
        this.container.querySelectorAll(".ums-mode-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.mode = btn.getAttribute("data-mode");
                this.render();
            });
        });

        // 2. Transposition Dial
        const btnTransUp = this.container.querySelector("#ums-btn-trans-up");
        const btnTransDown = this.container.querySelector("#ums-btn-trans-down");
        const btnTransReset = this.container.querySelector("#ums-btn-trans-reset");

        if (btnTransUp) {
            btnTransUp.addEventListener("click", () => {
                this.transposeSemitones = (this.transposeSemitones + 1) % 12;
                this.render();
            });
        }
        if (btnTransDown) {
            btnTransDown.addEventListener("click", () => {
                this.transposeSemitones = (this.transposeSemitones - 1) % 12;
                this.render();
            });
        }
        if (btnTransReset) {
            btnTransReset.addEventListener("click", () => {
                this.transposeSemitones = 0;
                this.render();
            });
        }

        // 3. Layer Toggles
        this.container.querySelectorAll(".ums-toggle-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const layer = chip.getAttribute("data-layer");
                if (layer === "chords") this.showChords = !this.showChords;
                if (layer === "lyrics") this.showLyrics = !this.showLyrics;
                if (layer === "minitab") this.showMiniTab = !this.showMiniTab;
                if (layer === "beatticks") this.showBeatTicks = !this.showBeatTicks;
                this.render();
            });
        });

        // 4. Density & Columns
        const colsSelect = this.container.querySelector("#ums-cols-select");
        if (colsSelect) {
            colsSelect.addEventListener("change", (e) => {
                this.gridCols = parseInt(e.target.value, 10);
                const wrapper = this.container.querySelector("#ums-wrapper");
                if (wrapper) wrapper.style.setProperty("--ums-grid-cols", this.gridCols);
            });
        }

        const densitySelect = this.container.querySelector("#ums-density-select");
        if (densitySelect) {
            densitySelect.addEventListener("change", (e) => {
                this.density = e.target.value;
                this.render();
            });
        }

        // 5. Search Box
        const searchInput = this.container.querySelector("#ums-search-input");
        const searchClear = this.container.querySelector("#ums-search-clear");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.render();
                // Focus back on search input
                const reSearch = this.container.querySelector("#ums-search-input");
                if (reSearch) {
                    reSearch.focus();
                    reSearch.selectionStart = reSearch.selectionEnd = reSearch.value.length;
                }
            });
        }
        if (searchClear) {
            searchClear.addEventListener("click", () => {
                this.searchQuery = "";
                this.render();
            });
        }

        // 6. Section Collapse
        this.container.querySelectorAll(".ums-section-header").forEach(hdr => {
            hdr.addEventListener("click", () => {
                const block = hdr.closest(".ums-section-block");
                if (block) block.classList.toggle("collapsed");
            });
        });

        // 7. Chord Voicing Popovers
        this.container.querySelectorAll(".ums-chord-chip, .ums-flow-chord-top").forEach(chip => {
            chip.addEventListener("click", (e) => {
                e.stopPropagation();
                const chordName = chip.getAttribute("data-chord");
                if (chordName) this.showChordPopover(chordName, chip);
            });
        });

        // 8. Measure Card Click -> Play Measure
        this.container.querySelectorAll(".ums-measure-card").forEach(card => {
            card.addEventListener("click", () => {
                const barIdx = parseInt(card.getAttribute("data-measure-index"), 10);
                if (barIdx) {
                    this.currentPlayMeasure = barIdx;
                    this.playChordAudioForMeasure(barIdx);
                }
            });
        });

        // 9. Web Audio Transport
        const btnPlay = this.container.querySelector("#ums-btn-play");
        const btnStop = this.container.querySelector("#ums-btn-stop");
        const btnMetronome = this.container.querySelector("#ums-btn-metronome");
        const btnPrint = this.container.querySelector("#ums-btn-print");

        if (btnPlay) {
            btnPlay.addEventListener("click", () => {
                if (this.isPlaying) {
                    this.pauseAudio();
                } else {
                    this.startAudioPlayback();
                }
            });
        }
        if (btnStop) {
            btnStop.addEventListener("click", () => {
                this.stopAudio();
            });
        }
        if (btnMetronome) {
            btnMetronome.addEventListener("click", () => {
                this.enableMetronome = !this.enableMetronome;
                btnMetronome.classList.toggle("primary", this.enableMetronome);
            });
        }
        if (btnPrint) {
            btnPrint.addEventListener("click", () => window.print());
        }

        // 10. Inspector Bar Selector
        this.container.querySelectorAll(".ums-bar-picker-item").forEach(item => {
            item.addEventListener("click", () => {
                const barNum = parseInt(item.getAttribute("data-select-bar"), 10);
                if (barNum) {
                    this.currentPlayMeasure = barNum;
                    this.render();
                }
            });
        });
    }

    // --------------------------------------------------------------------------
    // Web Audio Synthesizer & Live Playhead
    // --------------------------------------------------------------------------

    initAudioContext() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }
    }

    playTone(frequency, startTime, duration = 0.4, type = "triangle", gainLevel = 0.15) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(gainLevel, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    playMetronomeClick(isDownbeat = false) {
        if (!this.enableMetronome || !this.audioCtx) return;
        const freq = isDownbeat ? 1200 : 800;
        this.playTone(freq, this.audioCtx.currentTime, 0.05, "sine", 0.12);
    }

    playMidiNote(midiPitch, duration = 0.5) {
        this.initAudioContext();
        const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);
        this.playTone(freq, this.audioCtx.currentTime, duration, "sawtooth", 0.1);
    }

    playChordVoicingAudio(chordName) {
        this.initAudioContext();
        const info = CHORD_VOICINGS[chordName] || CHORD_VOICINGS["D"];
        const pitches = info.midi || [50, 57, 62, 66];
        const now = this.audioCtx.currentTime;

        // Arpeggiate chord notes with realistic acoustic guitar strum roll (15ms between strings)
        pitches.forEach((p, idx) => {
            const freq = 440 * Math.pow(2, (p - 69) / 12);
            this.playTone(freq, now + idx * 0.018, 0.8, "triangle", 0.08);
        });
    }

    playChordAudioForMeasure(measureIndex) {
        const measure = this.findMeasureByIndex(measureIndex);
        if (!measure) return;

        const events = measure.musical_events || measure.events || [];
        const chordEvt = events.find(e => e.layer_a?.chord);
        if (chordEvt) {
            const chord = this.transposeChord(chordEvt.layer_a.chord, this.transposeSemitones);
            this.playChordVoicingAudio(chord);
        } else {
            this.playMetronomeClick(true);
        }
    }

    findMeasureByIndex(index) {
        for (const sec of (this.currentUms?.structure || [])) {
            for (const m of (sec.measures || [])) {
                if (m.measure_index === index || m.measure_number === index) return m;
            }
        }
        return null;
    }

    startAudioPlayback() {
        this.initAudioContext();
        this.isPlaying = true;
        
        const tempo = this.currentUms.canonical?.original_tempo_bpm || 120;
        const beatIntervalMs = (60 / tempo) * 1000;
        const totalBars = this.getTotalMeasureCount();

        const btnPlay = this.container?.querySelector("#ums-btn-play");
        if (btnPlay) btnPlay.textContent = "⏸";

        if (this.playbackTimer) clearInterval(this.playbackTimer);

        this.playbackTimer = setInterval(() => {
            this.playMetronomeClick(this.currentPlayBeat === 1.0);

            // Trigger chord on downbeat if present
            if (this.currentPlayBeat === 1.0) {
                this.playChordAudioForMeasure(this.currentPlayMeasure);
            }

            this.updatePlayheadVisuals();

            this.currentPlayBeat += 1.0;
            if (this.currentPlayBeat > 4.0) { // Standard 4/4 assumption for continuous step
                this.currentPlayBeat = 1.0;
                this.currentPlayMeasure += 1;
                if (this.currentPlayMeasure > totalBars) {
                    this.currentPlayMeasure = 1;
                }
            }
        }, beatIntervalMs);
    }

    pauseAudio() {
        this.isPlaying = false;
        if (this.playbackTimer) clearInterval(this.playbackTimer);
        const btnPlay = this.container?.querySelector("#ums-btn-play");
        if (btnPlay) btnPlay.textContent = "▶";
    }

    stopAudio() {
        this.pauseAudio();
        this.currentPlayMeasure = 1;
        this.currentPlayBeat = 1.0;
        this.updatePlayheadVisuals();
    }

    updatePlayheadVisuals() {
        if (!this.container) return;

        // Update Tracker text
        const tracker = this.container.querySelector("#ums-bar-tracker");
        if (tracker) tracker.textContent = `Bar ${this.currentPlayMeasure}`;

        // Highlight active measure card
        this.container.querySelectorAll(".ums-measure-card").forEach(card => {
            const barNum = parseInt(card.getAttribute("data-measure-index"), 10);
            if (barNum === this.currentPlayMeasure) {
                card.classList.add("is-playing");
                // Smooth scroll into view if out of viewport
                if (this.isPlaying) {
                    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
            } else {
                card.classList.remove("is-playing");
            }
        });
    }

    // --------------------------------------------------------------------------
    // Interactive Chord Diagram Popover
    // --------------------------------------------------------------------------

    showChordPopover(chordName, triggerElement) {
        if (this.activePopover) {
            this.activePopover.remove();
            this.activePopover = null;
        }

        const rect = triggerElement.getBoundingClientRect();
        const popover = document.createElement("div");
        popover.className = "ums-chord-popover";

        popover.innerHTML = `
            <div class="ums-chord-popover-header">
                <span class="ums-chord-popover-title">${chordName}</span>
                <button class="ums-chord-play-btn" title="Play Sound Preview">🔊</button>
            </div>
            <div class="ums-chord-popover-svg">
                ${renderChordSvg(chordName)}
            </div>
        `;

        document.body.appendChild(popover);

        // Position popover relative to trigger element
        const top = Math.max(10, rect.top - 170 + window.scrollY);
        const left = Math.max(10, Math.min(window.innerWidth - 200, rect.left - 60 + window.scrollX));

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;

        popover.querySelector(".ums-chord-play-btn").addEventListener("click", () => {
            this.playChordVoicingAudio(chordName);
        });

        // Auto-close on click outside
        const closeHandler = (e) => {
            if (!popover.contains(e.target) && e.target !== triggerElement) {
                popover.remove();
                document.removeEventListener("click", closeHandler);
                this.activePopover = null;
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);

        this.activePopover = popover;
    }

    // --------------------------------------------------------------------------
    // Utilities & Helpers
    // --------------------------------------------------------------------------

    getSectionClass(secName) {
        const name = (secName || "").toLowerCase();
        if (name.includes("intro")) return "sec-intro";
        if (name.includes("verse")) return "sec-verse";
        if (name.includes("chorus")) return "sec-chorus";
        if (name.includes("bridge")) return "sec-bridge";
        if (name.includes("solo")) return "sec-solo";
        if (name.includes("outro")) return "sec-outro";
        return "sec-default";
    }

    getRhythmSymbol(rhythm) {
        switch (rhythm) {
            case "Whole": return "𝅝";
            case "Half": return "𝅗";
            case "Quarter": return "♩";
            case "Eighth": return "♪";
            case "16th":
            case "Sixteenth": return "𝅘𝅥𝅯";
            default: return "♩";
        }
    }

    measureMatchesSearch(measure, sectionName) {
        if (!this.searchQuery) return true;
        const q = this.searchQuery;
        if (sectionName.toLowerCase().includes(q)) return true;
        if (`bar ${measure.measure_index}`.includes(q)) return true;
        
        for (const evt of (measure.musical_events || measure.events || [])) {
            if (evt.layer_a?.chord?.toLowerCase().includes(q)) return true;
            if (evt.layer_a?.lyrics?.toLowerCase().includes(q)) return true;
        }
        return false;
    }

    escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
}
