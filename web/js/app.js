/**
 * Guitar Pro Reader & Visualizer Main Application Controller
 */

import { parseGuitarProFile } from "./gp_parser.js";
import { generateAsciiTab } from "./ascii_tab_generator.js";
import { generateChordPro } from "./chordpro_generator.js";
import { convertToUms } from "./ums_converter.js";
import { renderChordSvg } from "./chord_diagrams.js";

class App {
    constructor() {
        this.currentScore = null;
        this.activeTrackIndex = 0;
        this.asciiWrapBars = 2;
        this.activeTabId = "view-visual";
        this.alphaTabApi = null;
        this.currentRawBytes = null;

        this.initElements();
        this.initAlphaTab();
        this.initEventListeners();
        this.loadSample("samples/acoustic_fingerstyle.gp");
    }

    initElements() {
        // Tabs
        this.tabButtons = document.querySelectorAll(".tab-btn");
        this.tabPanes = document.querySelectorAll(".tab-pane");

        // Song Info
        this.songTitle = document.getElementById("song-title");
        this.songArtist = document.getElementById("song-artist");
        this.songAlbum = document.getElementById("song-album");
        this.badgeKey = document.getElementById("badge-key");
        this.badgeTempo = document.getElementById("badge-tempo");
        this.badgeTime = document.getElementById("badge-time");
        this.badgeTuning = document.getElementById("badge-tuning");
        this.badgeCapo = document.getElementById("badge-capo");
        this.badgeStrum = document.getElementById("badge-strum");
        this.badgeTrackCount = document.getElementById("badge-track-count");
        this.trackSelect = document.getElementById("track-select");

        // View Outputs
        this.asciiOutput = document.getElementById("ascii-tab-output");
        this.asciiWrapSelect = document.getElementById("ascii-wrap-select");
        this.chordproRendered = document.getElementById("chordpro-rendered");
        this.chordproRawOutput = document.getElementById("chordpro-raw-output");
        this.summaryMetaGrid = document.getElementById("summary-meta-grid");
        this.summaryTracksTableBody = document.querySelector("#summary-tracks-table tbody");
        this.summarySectionsTableBody = document.querySelector("#summary-sections-table tbody");
        this.summaryChordsGrid = document.getElementById("summary-chords-grid");
        this.umsJsonOutput = document.getElementById("ums-json-output");
        this.xmlRawOutput = document.getElementById("xml-raw-output");
        this.xmlSearchInput = document.getElementById("xml-search-input");

        // File Inputs & Drag Overlay
        this.fileInput = document.getElementById("file-input");
        this.dropOverlay = document.getElementById("drop-overlay");

        // Samples
        this.btnSampleAcoustic = document.getElementById("btn-sample-acoustic");
        this.btnSampleRock = document.getElementById("btn-sample-rock");
        this.btnSampleRector = document.getElementById("btn-sample-rector");

        // Export Buttons
        this.btnCopyView = document.getElementById("btn-copy-view");
        this.btnDownloadView = document.getElementById("btn-download-view");
        this.btnPrintView = document.getElementById("btn-print-view");

        this.btnCopyAscii = document.getElementById("btn-copy-ascii");
        this.btnDownloadAscii = document.getElementById("btn-download-ascii");
        this.btnCopyChordpro = document.getElementById("btn-copy-chordpro");
        this.btnDownloadChordpro = document.getElementById("btn-download-chordpro");
        this.btnCopyUms = document.getElementById("btn-copy-ums");
        this.btnDownloadUms = document.getElementById("btn-download-ums");
        this.btnCopyXml = document.getElementById("btn-copy-xml");

        // AlphaTab Player Elements
        this.atBtnPlay = document.getElementById("at-btn-play");
        this.atBtnStop = document.getElementById("at-btn-stop");
        this.atTimerCurrent = document.getElementById("at-timer-current");
        this.atTimerTotal = document.getElementById("at-timer-total");
        this.atBarCounter = document.getElementById("at-bar-counter");
        this.atStaveMode = document.getElementById("at-stave-mode");
        this.atLayoutMode = document.getElementById("at-layout-mode");
        this.atZoomLevel = document.getElementById("at-zoom-level");
        this.atSpeedSlider = document.getElementById("at-speed-slider");
        this.atSpeedLabel = document.getElementById("at-speed-label");
        this.atBtnMetronome = document.getElementById("at-btn-metronome");

        // Toast Container
        this.toastContainer = document.getElementById("toast-container");
    }

    initAlphaTab() {
        const atElement = document.getElementById("alphatab-container");
        if (!atElement || !window.alphaTab) return;

        try {
            this.alphaTabApi = new alphaTab.AlphaTabApi(atElement, {
                core: {
                    fontDirectory: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/font/",
                },
                player: {
                    enablePlayer: true,
                    soundFont: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/soundfont/sonivox.sf2",
                    scrollElement: document.querySelector(".alphatab-viewport")
                },
                display: {
                    staveProfile: "Default",
                    layoutMode: "Page"
                }
            });

            // Playback Events
            this.alphaTabApi.playerReady.on(() => {
                this.atBtnPlay.disabled = false;
            });

            this.alphaTabApi.playerStateChanged.on((args) => {
                const icon = this.atBtnPlay.querySelector(".at-icon-play") || this.atBtnPlay;
                if (args.state === alphaTab.synth.PlayerState.Playing) {
                    icon.textContent = "⏸";
                } else {
                    icon.textContent = "▶";
                }
            });

            this.alphaTabApi.playerPositionChanged.on((args) => {
                const currentSec = Math.floor(args.currentTime / 1000);
                const totalSec = Math.floor(args.endTime / 1000);
                this.atTimerCurrent.textContent = this.formatTime(currentSec);
                this.atTimerTotal.textContent = this.formatTime(totalSec);

                if (args.currentTick !== undefined && this.alphaTabApi.score) {
                    const masterBar = this.alphaTabApi.score.masterBars?.find(mb => args.currentTick >= mb.start && args.currentTick < mb.start + mb.calculateDuration());
                    if (masterBar) {
                        this.atBarCounter.textContent = `Bar ${masterBar.index + 1}`;
                    }
                }
            });

            // AlphaTab Score Loaded - extract any additional artist/title metadata from AlphaTab's score model
            this.alphaTabApi.scoreLoaded.on((alphaScore) => {
                if (alphaScore && this.currentScore) {
                    let changed = false;
                    const meta = this.currentScore.metadata;
                    if (!meta.title || meta.title === "Untitled") {
                        if (alphaScore.title) { meta.title = alphaScore.title; changed = true; }
                        else if (alphaScore.subTitle) { meta.title = alphaScore.subTitle; changed = true; }
                    }
                    if (!meta.artist || meta.artist === "Unknown" || meta.artist === "Unknown Artist") {
                        if (alphaScore.artist) { meta.artist = alphaScore.artist; changed = true; }
                        else if (alphaScore.music) { meta.artist = alphaScore.music; changed = true; }
                        else if (alphaScore.words) { meta.artist = alphaScore.words; changed = true; }
                    }
                    if (!meta.album && alphaScore.album) {
                        meta.album = alphaScore.album;
                        changed = true;
                    }
                    if (changed) {
                        this.renderHeader();
                        this.renderSummary();
                        this.renderActiveTrackViews();
                        this.renderUms();
                    }
                }
            });

        } catch (e) {
            console.warn("AlphaTab initialization warning:", e);
        }
    }

    initEventListeners() {
        // Tab switching
        this.tabButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const target = btn.getAttribute("data-target");
                this.switchTab(target);
            });
        });

        // Track selector
        this.trackSelect.addEventListener("change", (e) => {
            this.activeTrackIndex = parseInt(e.target.value, 10);
            this.renderActiveTrackViews();
        });

        // ASCII Wrap selector
        this.asciiWrapSelect.addEventListener("change", (e) => {
            this.asciiWrapBars = parseInt(e.target.value, 10);
            this.renderAsciiTab();
        });

        // File Input
        this.fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                this.loadFile(e.target.files[0]);
            }
        });

        // Drag & Drop
        window.addEventListener("dragenter", (e) => {
            e.preventDefault();
            this.dropOverlay.classList.add("active");
        });

        this.dropOverlay.addEventListener("dragleave", (e) => {
            if (e.target === this.dropOverlay) {
                this.dropOverlay.classList.remove("active");
            }
        });

        this.dropOverlay.addEventListener("dragover", (e) => {
            e.preventDefault();
        });

        this.dropOverlay.addEventListener("drop", (e) => {
            e.preventDefault();
            this.dropOverlay.classList.remove("active");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });

        // Sample Buttons
        this.btnSampleAcoustic.addEventListener("click", () => {
            this.loadSample("samples/acoustic_fingerstyle.gp");
        });
        this.btnSampleRock.addEventListener("click", () => {
            this.loadSample("samples/electric_rock_riff.gp");
        });
        if (this.btnSampleRector) {
            this.btnSampleRector.addEventListener("click", () => {
                this.loadSample("samples/ben_rector_love_like_this.gp");
            });
        }

        // Copy / Download Handlers
        this.btnCopyAscii.addEventListener("click", () => this.copyToClipboard(this.asciiOutput.textContent, "ASCII Tab copied!"));
        this.btnDownloadAscii.addEventListener("click", () => this.downloadFile(this.asciiOutput.textContent, `${this.getSongFileName()}.tab.txt`, "text/plain"));

        this.btnCopyChordpro.addEventListener("click", () => this.copyToClipboard(this.chordproRawOutput.textContent, "ChordPro copied!"));
        this.btnDownloadChordpro.addEventListener("click", () => this.downloadFile(this.chordproRawOutput.textContent, `${this.getSongFileName()}.chordpro`, "text/plain"));

        this.btnCopyUms.addEventListener("click", () => this.copyToClipboard(this.umsJsonOutput.textContent, "UMS JSON copied!"));
        this.btnDownloadUms.addEventListener("click", () => this.downloadFile(this.umsJsonOutput.textContent, `${this.getSongFileName()}.ums.json`, "application/json"));

        this.btnCopyXml.addEventListener("click", () => this.copyToClipboard(this.xmlRawOutput.textContent, "GPIF XML copied!"));

        // Global Copy / Download / Print
        this.btnCopyView.addEventListener("click", () => this.copyCurrentView());
        this.btnDownloadView.addEventListener("click", () => this.downloadCurrentView());
        this.btnPrintView.addEventListener("click", () => window.print());

        // AlphaTab Player Controls
        if (this.atBtnPlay) {
            this.atBtnPlay.addEventListener("click", () => {
                if (this.alphaTabApi) this.alphaTabApi.playPause();
            });
        }
        if (this.atBtnStop) {
            this.atBtnStop.addEventListener("click", () => {
                if (this.alphaTabApi) this.alphaTabApi.stop();
            });
        }
        if (this.atSpeedSlider) {
            this.atSpeedSlider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value, 10);
                this.atSpeedLabel.textContent = `${val}%`;
                if (this.alphaTabApi) this.alphaTabApi.playbackSpeed = val / 100;
            });
        }
        if (this.atStaveMode) {
            this.atStaveMode.addEventListener("change", (e) => {
                if (!this.alphaTabApi) return;
                const mode = e.target.value;
                if (mode === "score-tab") {
                    this.alphaTabApi.settings.display.staveProfile = "Default";
                } else if (mode === "tab") {
                    this.alphaTabApi.settings.display.staveProfile = "Tab";
                } else if (mode === "score") {
                    this.alphaTabApi.settings.display.staveProfile = "Score";
                }
                this.alphaTabApi.updateSettings();
                this.alphaTabApi.render();
            });
        }
        if (this.atLayoutMode) {
            this.atLayoutMode.addEventListener("change", (e) => {
                if (!this.alphaTabApi) return;
                this.alphaTabApi.settings.display.layoutMode = e.target.value === "horizontal" ? "Horizontal" : "Page";
                this.alphaTabApi.updateSettings();
                this.alphaTabApi.render();
            });
        }
        if (this.atZoomLevel) {
            this.atZoomLevel.addEventListener("change", (e) => {
                if (!this.alphaTabApi) return;
                this.alphaTabApi.settings.display.scale = parseInt(e.target.value, 10) / 100;
                this.alphaTabApi.updateSettings();
                this.alphaTabApi.render();
            });
        }
        if (this.atBtnMetronome) {
            this.atBtnMetronome.addEventListener("click", () => {
                if (!this.alphaTabApi) return;
                this.alphaTabApi.metronomeVolume = this.alphaTabApi.metronomeVolume > 0 ? 0 : 1;
                this.atBtnMetronome.classList.toggle("active", this.alphaTabApi.metronomeVolume > 0);
                this.showToast(this.alphaTabApi.metronomeVolume > 0 ? "Metronome Enabled" : "Metronome Muted");
            });
        }

        // XML Search Filter
        this.xmlSearchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            if (!this.currentScore || !this.currentScore.rawXml) return;
            if (!query) {
                this.xmlRawOutput.textContent = this.currentScore.rawXml;
                return;
            }
            const lines = this.currentScore.rawXml.split("\n");
            const filtered = lines.filter(l => l.toLowerCase().includes(query));
            this.xmlRawOutput.textContent = `<!-- Showing ${filtered.length} matching lines out of ${lines.length} -->\n\n` + filtered.join("\n");
        });
    }

    switchTab(tabId) {
        this.activeTabId = tabId;
        this.tabButtons.forEach(b => {
            const isMatch = b.getAttribute("data-target") === tabId;
            b.classList.toggle("active", isMatch);
            b.setAttribute("aria-selected", isMatch ? "true" : "false");
        });

        this.tabPanes.forEach(pane => {
            pane.classList.toggle("active", pane.id === tabId);
        });

        if (tabId === "view-visual" && this.alphaTabApi) {
            this.alphaTabApi.render();
        }
    }

    async loadSample(url) {
        try {
            this.showToast(`Loading sample: ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            await this.processScoreData(arrayBuffer, url.split("/").pop());
        } catch (e) {
            console.error("Failed to load sample:", e);
            this.showToast(`Error loading sample: ${e.message}`);
        }
    }

    async loadFile(file) {
        try {
            this.showToast(`Loading ${file.name}...`);
            const arrayBuffer = await file.arrayBuffer();
            await this.processScoreData(arrayBuffer, file.name);
        } catch (e) {
            console.error("Failed to load file:", e);
            this.showToast(`Error reading file: ${e.message}`);
        }
    }

    async processScoreData(buffer, fileName) {
        this.currentRawBytes = buffer;
        const scoreModel = await parseGuitarProFile(buffer);
        this.currentScore = scoreModel;
        this.activeTrackIndex = 0;

        // Render AlphaTab Score
        if (this.alphaTabApi) {
            try {
                this.alphaTabApi.load(new Uint8Array(buffer));
            } catch (err) {
                console.warn("AlphaTab render failed:", err);
            }
        }

        // Render UI Views
        this.renderHeader();
        this.renderTrackSelector();
        this.renderActiveTrackViews();
        this.renderSummary();
        this.renderUms();
        this.renderXml();

        this.showToast(`Loaded: ${scoreModel.metadata.title || fileName}`);
    }

    renderHeader() {
        const s = this.currentScore;
        const title = s.metadata.title || s.metadata.subTitle || s.metadata.name || s.title || "Untitled";
        const artist = s.metadata.artist || s.metadata.music || s.metadata.words || s.metadata.author || s.metadata.composer || s.artist || "Unknown Artist";
        const album = s.metadata.album || s.metadata.collection || s.album || "Guitar Pro Archive";

        this.songTitle.textContent = title;
        this.songArtist.textContent = artist;
        this.songAlbum.textContent = album;
        const primaryTime = s.getPrimaryTimeSignature ? s.getPrimaryTimeSignature() : (s.masterbars[0]?.time || "4/4");
        const hasPickup = s.hasPickupMeasure ? s.hasPickupMeasure() : false;
        this.badgeTime.textContent = hasPickup ? `${primaryTime} (Pickup ${s.masterbars[0].time})` : primaryTime;

        if (this.badgeKey) {
            const keyVal = s.metadata?.key || s.canonical?.original_key;
            if (keyVal) {
                this.badgeKey.textContent = `Key: ${keyVal}`;
                this.badgeKey.style.display = "inline-flex";
            } else {
                this.badgeKey.style.display = "none";
            }
        }
        if (this.badgeStrum) {
            const strumVal = s.metadata?.strum_pattern || s.canonical?.strum_pattern;
            if (strumVal) {
                this.badgeStrum.textContent = `🪕 ${strumVal}`;
                this.badgeStrum.style.display = "inline-flex";
            } else {
                this.badgeStrum.style.display = "none";
            }
        }
        const primaryTrack = s.tracks[0];
        if (primaryTrack) {
            this.badgeTuning.textContent = `Tuning: ${primaryTrack.tuningNames.join(" ")}`;
            this.badgeCapo.textContent = `Capo: ${primaryTrack.capo}`;
        }
        this.badgeTrackCount.textContent = `${s.tracks.length} Track${s.tracks.length > 1 ? "s" : ""}`;
    }

    renderTrackSelector() {
        this.trackSelect.innerHTML = "";
        this.currentScore.tracks.forEach((t, idx) => {
            const opt = document.createElement("option");
            opt.value = idx;
            opt.textContent = `[${idx + 1}] ${t.name} (${t.tuningNames.join(" ")})`;
            if (idx === this.activeTrackIndex) opt.selected = true;
            this.trackSelect.appendChild(opt);
        });
    }

    renderActiveTrackViews() {
        this.renderAsciiTab();
        this.renderChordPro();

        // If AlphaTab loaded, update track selection in alphaTab
        if (this.alphaTabApi && this.alphaTabApi.score && this.alphaTabApi.score.tracks[this.activeTrackIndex]) {
            this.alphaTabApi.renderTracks([this.alphaTabApi.score.tracks[this.activeTrackIndex]]);
        }
    }

    renderAsciiTab() {
        if (!this.currentScore) return;
        const text = generateAsciiTab(this.currentScore, this.activeTrackIndex, this.asciiWrapBars);
        this.asciiOutput.textContent = text;
    }

    renderChordPro() {
        if (!this.currentScore) return;
        const rawText = generateChordPro(this.currentScore, this.activeTrackIndex);
        this.chordproRawOutput.textContent = rawText;

        // Render HTML formatted version
        const lines = rawText.split("\n");
        const htmlParts = [];
        lines.forEach(line => {
            if (line.startsWith("{") && line.endsWith("}")) {
                const directive = line.slice(1, -1);
                if (directive.startsWith("start_of_")) {
                    const sec = directive.replace("start_of_", "").toUpperCase();
                    htmlParts.push(`<div class="cp-section-header">─── ${sec} ───</div>`);
                } else if (directive.startsWith("end_of_")) {
                    htmlParts.push(`<br>`);
                } else {
                    htmlParts.push(`<div style="color: var(--text-muted); font-size: 0.8rem;">${this.escapeHtml(line)}</div>`);
                }
            } else if (line.startsWith("#")) {
                htmlParts.push(`<div class="cp-section-header">${this.escapeHtml(line)}</div>`);
            } else {
                // Highlight [Chord]
                const formatted = this.escapeHtml(line).replace(/\[([A-Za-z0-9#\/+ -]+)\]/g, `<span class="cp-chord">$1</span>`);
                htmlParts.push(`<div>${formatted}</div>`);
            }
        });
        this.chordproRendered.innerHTML = htmlParts.join("");
    }

    renderSummary() {
        const s = this.currentScore;
        if (!s) return;

        const title = s.metadata.title || s.metadata.subTitle || s.metadata.name || s.title || "-";
        const artist = s.metadata.artist || s.metadata.music || s.metadata.words || s.metadata.author || s.metadata.composer || s.artist || "-";
        const album = s.metadata.album || s.metadata.collection || s.album || "-";
        const composer = s.metadata.music || s.metadata.composer || "-";
        const lyricist = s.metadata.words || s.metadata.lyricist || "-";
        const transcriber = s.metadata.tabber || s.metadata.transcriber || "-";
        const copyright = s.metadata.copyright || "-";

        // Metadata grid
        this.summaryMetaGrid.innerHTML = `
            <div class="meta-item"><div class="meta-item-label">Title</div><div class="meta-item-value">${title}</div></div>
            <div class="meta-item"><div class="meta-item-label">Artist</div><div class="meta-item-value">${artist}</div></div>
            <div class="meta-item"><div class="meta-item-label">Album</div><div class="meta-item-value">${album}</div></div>
            <div class="meta-item"><div class="meta-item-label">Composer / Music</div><div class="meta-item-value">${composer}</div></div>
            <div class="meta-item"><div class="meta-item-label">Words / Lyrics</div><div class="meta-item-value">${lyricist}</div></div>
            <div class="meta-item"><div class="meta-item-label">Key</div><div class="meta-item-value">${s.metadata?.key || s.canonical?.original_key || "D"}</div></div>
            <div class="meta-item"><div class="meta-item-label">Tempo</div><div class="meta-item-value">${s.tempo} BPM</div></div>
            <div class="meta-item"><div class="meta-item-label">Time Signature</div><div class="meta-item-value">${s.getPrimaryTimeSignature ? (s.hasPickupMeasure() ? `${s.getPrimaryTimeSignature()} (${s.masterbars[0].time} pickup)` : s.getPrimaryTimeSignature()) : (s.masterbars[0]?.time || "4/4")}</div></div>
            <div class="meta-item"><div class="meta-item-label">Total Measures</div><div class="meta-item-value">${s.masterbars.length}</div></div>
            <div class="meta-item"><div class="meta-item-label">Strumming Pattern</div><div class="meta-item-value">${s.metadata?.strum_pattern || s.canonical?.strum_pattern || "-"}</div></div>
            <div class="meta-item"><div class="meta-item-label">Transcriber</div><div class="meta-item-value">${transcriber}</div></div>
            <div class="meta-item"><div class="meta-item-label">Copyright</div><div class="meta-item-value">${copyright}</div></div>
        `;

        // Tracks Table
        this.summaryTracksTableBody.innerHTML = s.tracks.map((t, idx) => `
            <tr>
                <td><strong>${idx + 1}</strong></td>
                <td>${t.name}</td>
                <td><code>${t.tuningNames.join(" ")}</code></td>
                <td>Fret ${t.capo}</td>
                <td>${t.stringCount} Strings</td>
            </tr>
        `).join("");

        // Sections Table
        const secRows = [];
        s.masterbars.forEach((mb, mbIdx) => {
            if (mb.sectionId !== null && s.sections.has(mb.sectionId)) {
                const sec = s.sections.get(mb.sectionId);
                secRows.push(`
                    <tr>
                        <td><strong>${sec.name}</strong></td>
                        <td>Measure ${mbIdx + 1}</td>
                        <td>${mb.time}</td>
                        <td>${sec.text || "-"}</td>
                    </tr>
                `);
            }
        });
        this.summarySectionsTableBody.innerHTML = secRows.length > 0 ? secRows.join("") : `<tr><td colspan="4" style="color: var(--text-muted);">No section markers defined in score.</td></tr>`;

        // Chord Dictionary
        const chords = s.getAllChords();
        if (chords.length > 0) {
            this.summaryChordsGrid.innerHTML = chords.map(c => `
                <div class="chord-box">
                    ${renderChordSvg(c)}
                </div>
            `).join("");
        } else {
            this.summaryChordsGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No chord annotations found in score.</p>`;
        }
    }

    renderUms() {
        if (!this.currentScore) return;
        const umsData = convertToUms(this.currentScore);
        this.umsJsonOutput.textContent = JSON.stringify(umsData, null, 2);
    }

    renderXml() {
        if (!this.currentScore) return;
        this.xmlRawOutput.textContent = this.currentScore.rawXml;
    }

    copyCurrentView() {
        let content = "";
        if (this.activeTabId === "view-ascii") content = this.asciiOutput.textContent;
        else if (this.activeTabId === "view-chordpro") content = this.chordproRawOutput.textContent;
        else if (this.activeTabId === "view-ums") content = this.umsJsonOutput.textContent;
        else if (this.activeTabId === "view-xml") content = this.xmlRawOutput.textContent;
        else content = this.asciiOutput.textContent;

        this.copyToClipboard(content, "View content copied to clipboard!");
    }

    downloadCurrentView() {
        const baseName = this.getSongFileName();
        if (this.activeTabId === "view-ascii") this.downloadFile(this.asciiOutput.textContent, `${baseName}.tab.txt`, "text/plain");
        else if (this.activeTabId === "view-chordpro") this.downloadFile(this.chordproRawOutput.textContent, `${baseName}.chordpro`, "text/plain");
        else if (this.activeTabId === "view-ums") this.downloadFile(this.umsJsonOutput.textContent, `${baseName}.ums.json`, "application/json");
        else if (this.activeTabId === "view-xml") this.downloadFile(this.xmlRawOutput.textContent, `${baseName}.gpif.xml`, "application/xml");
        else this.downloadFile(this.asciiOutput.textContent, `${baseName}.tab.txt`, "text/plain");
    }

    getSongFileName() {
        if (!this.currentScore) return "guitar_pro_tab";
        const meta = this.currentScore.metadata || {};
        const artist = meta.artist || meta.music || meta.words || meta.author || "";
        const title = meta.title || meta.subTitle || "tab";
        const combined = artist ? `${artist}_-_${title}` : title;
        return combined.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
    }

    copyToClipboard(text, successMsg) {
        if (!navigator.clipboard) {
            this.showToast("Clipboard API not available");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this.showToast(successMsg);
        }).catch(err => {
            this.showToast("Failed to copy to clipboard");
        });
    }

    downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`Downloaded: ${fileName}`);
    }

    showToast(message) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(50px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Start App when DOM ready
document.addEventListener("DOMContentLoaded", () => {
    window.app = new App();
});
