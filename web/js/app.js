/**
 * Guitar Pro Reader & Visualizer Main Application Controller
 * Universal Multi-Source Ingestion, Theming, and Playback Engine.
 */

import { parseGuitarProFile } from "./gp_parser.js";
import { generateAsciiTab } from "./ascii_tab_generator.js";
import { generateChordPro } from "./chordpro_generator.js";
import { convertToUms } from "./ums_converter.js";
import { renderChordSvg } from "./chord_diagrams.js";
import { parsePdfMusic } from "./pdf_extractor.js";
import { buildCompleteUmsClient } from "./ums_builder.js";

class App {
    constructor() {
        this.currentScore = null;
        this.currentUms = null;
        this.activeTrackIndex = 0;
        this.asciiWrapBars = 2;
        this.activeTabId = "view-visual";
        this.alphaTabApi = null;
        this.currentRawBytes = null;

        // Multi-source slot states
        this.slotFiles = {
            gp: null,      // { file, buffer, parsedScore }
            chords: null,  // { file, buffer, parsedPdf }
            vocals: null,  // { file, buffer, parsedPdf }
            piano: null    // { file, buffer, parsedPdf }
        };

        this.initElements();
        this.initTheme();
        this.initAlphaTab();
        this.initEventListeners();
        this.initIngestModal();

        // Default initial load
        this.loadSample("samples/acoustic_fingerstyle.gp");
    }

    initElements() {
        // Theme Select
        this.themeSelect = document.getElementById("theme-select");

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
        this.badgeReconciliation = document.getElementById("badge-reconciliation");
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
        this.summaryReconciliationCard = document.getElementById("summary-reconciliation-card");
        this.summaryReconciliationTableBody = document.querySelector("#summary-reconciliation-table tbody");
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

        // Multi-Source Ingest Modal Elements
        this.btnOpenIngestModal = document.getElementById("btn-open-ingest-modal");
        this.btnCloseIngestModal = document.getElementById("btn-close-ingest-modal");
        this.btnCancelIngest = document.getElementById("btn-cancel-ingest");
        this.ingestModalBackdrop = document.getElementById("ingest-modal-backdrop");
        this.modalBatchDropzone = document.getElementById("modal-batch-dropzone");
        this.btnFuseUms = document.getElementById("btn-fuse-ums");
        this.btnLoadBundleSample = document.getElementById("btn-load-bundle-sample");
        this.btnClearAllSlots = document.getElementById("btn-clear-all-slots");

        // Slot Cards & Inputs
        this.slotCards = {
            gp: document.getElementById("slot-card-gp"),
            chords: document.getElementById("slot-card-chords"),
            vocals: document.getElementById("slot-card-vocals"),
            piano: document.getElementById("slot-card-piano")
        };
        this.slotContents = {
            gp: document.getElementById("slot-content-gp"),
            chords: document.getElementById("slot-content-chords"),
            vocals: document.getElementById("slot-content-vocals"),
            piano: document.getElementById("slot-content-piano")
        };
        this.slotInputs = {
            gp: document.getElementById("slot-input-gp"),
            chords: document.getElementById("slot-input-chords"),
            vocals: document.getElementById("slot-input-vocals"),
            piano: document.getElementById("slot-input-piano")
        };

        // Toast Container
        this.toastContainer = document.getElementById("toast-container");
    }

    /* --------------------------------------------------------------------------
       Theme System Controller
       -------------------------------------------------------------------------- */
    initTheme() {
        const savedTheme = localStorage.getItem("gp_theme") || "theme-light";
        this.setTheme(savedTheme);
        if (this.themeSelect) {
            this.themeSelect.value = savedTheme;
            this.themeSelect.addEventListener("change", (e) => this.setTheme(e.target.value));
        }
    }

    setTheme(themeName) {
        document.body.className = themeName;
        localStorage.setItem("gp_theme", themeName);
        if (this.themeSelect) this.themeSelect.value = themeName;
    }

    /* --------------------------------------------------------------------------
       AlphaTab Visual Player Init
       -------------------------------------------------------------------------- */
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

            this.alphaTabApi.scoreLoaded.on((alphaScore) => {
                if (alphaScore) {
                    if (alphaScore.title && (!this.currentScore || !this.currentScore.metadata.title)) {
                        this.songTitle.textContent = alphaScore.title;
                    }
                    if (alphaScore.artist && (!this.currentScore || !this.currentScore.metadata.artist)) {
                        this.songArtist.textContent = alphaScore.artist;
                    }
                }
            });

        } catch (err) {
            console.error("AlphaTab Initialization Error:", err);
        }
    }

    initEventListeners() {
        // Tab Navigation
        this.tabButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                this.switchTab(btn.getAttribute("data-target"));
            });
        });

        // Track Selection Change
        this.trackSelect.addEventListener("change", (e) => {
            this.activeTrackIndex = parseInt(e.target.value, 10);
            this.renderActiveTrackViews();
        });

        // ASCII Wrap Selection
        this.asciiWrapSelect.addEventListener("change", (e) => {
            this.asciiWrapBars = parseInt(e.target.value, 10);
            this.renderAsciiTab();
        });

        // File Input Change
        this.fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                if (e.target.files.length === 1) {
                    this.loadFile(e.target.files[0]);
                } else {
                    this.openIngestModal();
                    this.handleBatchFiles(Array.from(e.target.files));
                }
            }
        });

        // Global Drag & Drop Handlers
        window.addEventListener("dragenter", (e) => {
            e.preventDefault();
            this.dropOverlay.classList.remove("visually-hidden");
        });

        this.dropOverlay.addEventListener("dragover", (e) => {
            e.preventDefault();
        });

        this.dropOverlay.addEventListener("dragleave", (e) => {
            e.preventDefault();
            if (e.relatedTarget === null || e.clientY <= 0 || e.clientX <= 0) {
                this.dropOverlay.classList.add("visually-hidden");
            }
        });

        this.dropOverlay.addEventListener("drop", (e) => {
            e.preventDefault();
            this.dropOverlay.classList.add("visually-hidden");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                if (e.dataTransfer.files.length === 1 && !e.dataTransfer.files[0].name.toLowerCase().endsWith(".pdf")) {
                    this.loadFile(e.dataTransfer.files[0]);
                } else {
                    this.openIngestModal();
                    this.handleBatchFiles(Array.from(e.dataTransfer.files));
                }
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

        // AlphaTab Player UI Actions
        if (this.atBtnPlay) {
            this.atBtnPlay.addEventListener("click", () => {
                if (this.alphaTabApi) this.alphaTabApi.playPause();
            });
        }
        if (this.atBtnStop) {
            this.atBtnStop.addEventListener("click", () => {
                if (this.alphaTabApi) {
                    this.alphaTabApi.stop();
                    this.atBarCounter.textContent = "Bar 1";
                }
            });
        }
        if (this.atSpeedSlider) {
            this.atSpeedSlider.addEventListener("input", (e) => {
                const speed = parseFloat(e.target.value);
                this.atSpeedLabel.textContent = `${Math.round(speed * 100)}%`;
                if (this.alphaTabApi) this.alphaTabApi.playbackSpeed = speed;
            });
        }
        if (this.atStaveMode) {
            this.atStaveMode.addEventListener("change", (e) => {
                if (!this.alphaTabApi) return;
                const mode = e.target.value;
                if (mode === "default") {
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

    /* --------------------------------------------------------------------------
       Multi-Source Ingestion Dashboard Controller
       -------------------------------------------------------------------------- */
    initIngestModal() {
        if (!this.btnOpenIngestModal) return;

        this.btnOpenIngestModal.addEventListener("click", () => this.openIngestModal());
        this.btnCloseIngestModal.addEventListener("click", () => this.closeIngestModal());
        this.btnCancelIngest.addEventListener("click", () => this.closeIngestModal());

        // Close on backdrop click
        this.ingestModalBackdrop.addEventListener("click", (e) => {
            if (e.target === this.ingestModalBackdrop) this.closeIngestModal();
        });

        // Slot Input Listeners
        Object.keys(this.slotInputs).forEach(slotKey => {
            const input = this.slotInputs[slotKey];
            if (input) {
                input.addEventListener("change", (e) => {
                    if (e.target.files && e.target.files[0]) {
                        this.handleSlotFile(e.target.files[0], slotKey);
                    }
                });
            }
        });

        // Slot Content Click -> trigger input
        Object.keys(this.slotContents).forEach(slotKey => {
            const content = this.slotContents[slotKey];
            if (content) {
                content.addEventListener("click", () => {
                    if (!this.slotFiles[slotKey]) {
                        this.slotInputs[slotKey].click();
                    }
                });
            }
        });

        // Clear Slot buttons
        document.querySelectorAll(".btn-clear-slot").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const slot = e.target.getAttribute("data-slot");
                this.clearSlot(slot);
            });
        });

        // Clear All Slots
        if (this.btnClearAllSlots) {
            this.btnClearAllSlots.addEventListener("click", () => this.clearAllSlots());
        }

        // Master Batch Dropzone
        if (this.modalBatchDropzone) {
            this.modalBatchDropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                this.modalBatchDropzone.classList.add("dragover");
            });
            this.modalBatchDropzone.addEventListener("dragleave", (e) => {
                e.preventDefault();
                this.modalBatchDropzone.classList.remove("dragover");
            });
            this.modalBatchDropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                this.modalBatchDropzone.classList.remove("dragover");
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.handleBatchFiles(Array.from(e.dataTransfer.files));
                }
            });
            this.modalBatchDropzone.addEventListener("click", () => {
                // Default trigger GP file picker
                this.slotInputs.gp.click();
            });
        }

        // Fuse & Build UMS Button
        if (this.btnFuseUms) {
            this.btnFuseUms.addEventListener("click", () => this.fuseAndApplyUms());
        }

        // Load Ben Rector Demo Bundle
        if (this.btnLoadBundleSample) {
            this.btnLoadBundleSample.addEventListener("click", () => this.loadBundleSample());
        }
    }

    openIngestModal() {
        this.ingestModalBackdrop.classList.add("active");
    }

    closeIngestModal() {
        this.ingestModalBackdrop.classList.remove("active");
    }

    async handleBatchFiles(files) {
        for (const file of files) {
            const name = file.name.toLowerCase();
            let targetSlot = null;

            if (name.endsWith(".gp") || name.endsWith(".gpx") || name.endsWith(".gp5") || name.endsWith(".gp4") || name.endsWith(".gp3") || name.endsWith(".gpif") || name.endsWith(".xml")) {
                targetSlot = "gp";
            } else if (name.includes("chord") || name.endsWith(".chordpro") || name.endsWith(".txt")) {
                targetSlot = "chords";
            } else if (name.includes("vocal") || name.includes("melody")) {
                targetSlot = "vocals";
            } else if (name.includes("piano") || name.includes("score")) {
                targetSlot = "piano";
            } else if (name.endsWith(".pdf")) {
                // Assign to first empty PDF slot
                if (!this.slotFiles.chords) targetSlot = "chords";
                else if (!this.slotFiles.vocals) targetSlot = "vocals";
                else if (!this.slotFiles.piano) targetSlot = "piano";
                else targetSlot = "chords";
            }

            if (targetSlot) {
                await this.handleSlotFile(file, targetSlot);
            }
        }
    }

    async handleSlotFile(file, slotKey) {
        try {
            const buffer = await file.arrayBuffer();
            let parsedData = null;

            if (slotKey === "gp") {
                parsedData = await parseGuitarProFile(buffer);
                this.slotFiles.gp = { file, buffer, parsedData };
                this.updateSlotUI("gp", file.name, `Tempo: ${parsedData.tempo} BPM | Tracks: ${parsedData.tracks.length}`);
            } else if (slotKey === "chords") {
                parsedData = await parsePdfMusic(buffer, file.name);
                this.slotFiles.chords = { file, buffer, parsedData };
                const key = parsedData.metadata.key ? `Key: ${parsedData.metadata.key}` : "";
                const chordsCount = `${parsedData.metadata.chords_detected.length} Chords`;
                this.updateSlotUI("chords", file.name, `${key} ${chordsCount}`.trim());
            } else if (slotKey === "vocals") {
                parsedData = await parsePdfMusic(buffer, file.name);
                this.slotFiles.vocals = { file, buffer, parsedData };
                this.updateSlotUI("vocals", file.name, `${parsedData.structure.length} Sections detected`);
            } else if (slotKey === "piano") {
                parsedData = await parsePdfMusic(buffer, file.name);
                this.slotFiles.piano = { file, buffer, parsedData };
                this.updateSlotUI("piano", file.name, `Piano score loaded (${Math.round(file.size / 1024)} KB)`);
            }

            this.checkFuseReadyState();
            this.showToast(`Loaded ${file.name} into ${slotKey.toUpperCase()} slot`);
        } catch (err) {
            console.error(`Error loading slot ${slotKey}:`, err);
            this.showToast(`Error reading ${file.name}: ${err.message}`);
        }
    }

    updateSlotUI(slotKey, fileName, metaText) {
        const card = this.slotCards[slotKey];
        const content = this.slotContents[slotKey];
        if (!card || !content) return;

        card.classList.add("loaded");
        content.innerHTML = `
            <div class="slot-file-name">📄 ${fileName}</div>
            <div class="slot-file-meta">${metaText}</div>
        `;

        const clearBtn = card.querySelector(".btn-clear-slot");
        if (clearBtn) clearBtn.style.display = "inline-flex";
    }

    clearSlot(slotKey) {
        this.slotFiles[slotKey] = null;
        const card = this.slotCards[slotKey];
        const content = this.slotContents[slotKey];
        if (card && content) {
            card.classList.remove("loaded");
            const placeholders = {
                gp: "Drop .gp, .gpx, or .gpif file",
                chords: "Drop chords.pdf or lead sheet",
                vocals: "Drop vocals.pdf score",
                piano: "Drop piano.pdf score"
            };
            content.innerHTML = `<div class="slot-placeholder-text">${placeholders[slotKey]}</div>`;

            const clearBtn = card.querySelector(".btn-clear-slot");
            if (clearBtn) clearBtn.style.display = "none";
        }
        this.checkFuseReadyState();
    }

    clearAllSlots() {
        Object.keys(this.slotFiles).forEach(k => this.clearSlot(k));
    }

    checkFuseReadyState() {
        // Can fuse if at least GP is loaded, or if Chords PDF is loaded
        const canFuse = Boolean(this.slotFiles.gp || this.slotFiles.chords);
        if (this.btnFuseUms) {
            this.btnFuseUms.disabled = !canFuse;
        }
    }

    async fuseAndApplyUms() {
        try {
            this.showToast("Synthesizing multi-source UMS...");

            let gpScore = this.slotFiles.gp?.parsedData;
            if (!gpScore && this.currentScore) {
                gpScore = this.currentScore;
            }

            if (!gpScore) {
                throw new Error("Please provide at least one Guitar Pro file for the rhythmic notation grid.");
            }

            const chordsData = this.slotFiles.chords?.parsedData || null;
            const vocalsData = this.slotFiles.vocals?.parsedData || null;

            // Synthesize complete UMS
            const completeUms = buildCompleteUmsClient(gpScore, chordsData, vocalsData);
            this.currentUms = completeUms;
            this.currentScore = gpScore;
            this.currentScore.canonical = completeUms.canonical;
            this.currentScore.structure = completeUms.structure;

            // Load AlphaTab if raw bytes available
            if (this.slotFiles.gp?.buffer && this.alphaTabApi) {
                this.currentRawBytes = this.slotFiles.gp.buffer;
                try {
                    this.alphaTabApi.load(new Uint8Array(this.slotFiles.gp.buffer));
                } catch (e) {
                    console.warn("AlphaTab render warning:", e);
                }
            }

            // Render all live views
            this.renderHeader();
            this.renderTrackSelector();
            this.renderActiveTrackViews();
            this.renderSummary();
            this.renderUms();
            this.renderXml();

            this.closeIngestModal();
            this.showToast("✨ Complete UMS Synthesized Successfully!");
        } catch (err) {
            console.error("Fusion error:", err);
            this.showToast(`Fusion Error: ${err.message}`);
        }
    }

    async loadBundleSample() {
        try {
            this.showToast("Fetching Ben Rector Multi-Source Bundle...");

            // 1. Fetch GP Score
            const resGp = await fetch("samples/ben_rector_love_like_this.gp");
            const bufGp = await resGp.arrayBuffer();
            const parsedGp = await parseGuitarProFile(bufGp);
            this.slotFiles.gp = { file: { name: "Ben Rector-Love Like This.gp" }, buffer: bufGp, parsedData: parsedGp };
            this.updateSlotUI("gp", "Ben Rector-Love Like This.gp", `Tempo: ${parsedGp.tempo} BPM | 118 Bars`);

            // 2. Fetch Chords PDF
            const resChords = await fetch("samples/ben_rector_chords.pdf");
            const bufChords = await resChords.arrayBuffer();
            const parsedChords = await parsePdfMusic(bufChords, "love like this chords.pdf");
            this.slotFiles.chords = { file: { name: "love like this chords.pdf" }, buffer: bufChords, parsedData: parsedChords };
            this.updateSlotUI("chords", "love like this chords.pdf", `Key: ${parsedChords.metadata.key || "D"} | ${parsedChords.metadata.chords_detected.length} Chords`);

            // 3. Fetch Vocals PDF
            const resVocals = await fetch("samples/ben_rector_vocals.pdf");
            const bufVocals = await resVocals.arrayBuffer();
            const parsedVocals = await parsePdfMusic(bufVocals, "love like this vocals.pdf");
            this.slotFiles.vocals = { file: { name: "love like this vocals.pdf" }, buffer: bufVocals, parsedData: parsedVocals };
            this.updateSlotUI("vocals", "love like this vocals.pdf", `${parsedVocals.structure.length} Sections mapped`);

            this.checkFuseReadyState();
            this.showToast("Bundle files loaded into slots! Click Fuse & Build UMS.");
        } catch (err) {
            console.error("Failed to load sample bundle:", err);
            this.showToast(`Error loading bundle: ${err.message}`);
        }
    }

    /* --------------------------------------------------------------------------
       Data Processing & View Rendering
       -------------------------------------------------------------------------- */
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
            this.showToast(`Loading: ${url.split("/").pop()}...`);
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
            
            if (file.name.toLowerCase().endsWith(".pdf")) {
                this.openIngestModal();
                await this.handleSlotFile(file, "chords");
                return;
            }

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
        if (!s) return;

        const title = s.canonical?.title || s.metadata?.title || s.metadata?.subTitle || s.metadata?.name || s.title || "Untitled";
        const artist = s.canonical?.artist || s.metadata?.artist || s.metadata?.music || s.metadata?.words || s.metadata?.author || s.metadata?.composer || s.artist || "Unknown Artist";
        const album = s.canonical?.album || s.metadata?.album || s.metadata?.collection || s.album || "Guitar Pro Archive";

        this.songTitle.textContent = title;
        this.songArtist.textContent = artist;
        this.songAlbum.textContent = album;
        
        const primaryTime = s.canonical?.original_time_signature || (s.getPrimaryTimeSignature ? s.getPrimaryTimeSignature() : (s.masterbars[0]?.time || "4/4"));
        const hasPickup = s.hasPickupMeasure ? s.hasPickupMeasure() : false;
        this.badgeTime.textContent = hasPickup ? `${primaryTime} (Pickup ${s.masterbars[0].time})` : primaryTime;
        this.badgeTempo.textContent = `⏱ ${s.canonical?.original_tempo_bpm || s.tempo} BPM`;

        if (this.badgeKey) {
            const keyVal = s.canonical?.original_key || s.metadata?.key;
            if (keyVal) {
                this.badgeKey.textContent = `Key: ${keyVal}`;
                this.badgeKey.style.display = "inline-flex";
            } else {
                this.badgeKey.style.display = "none";
            }
        }
        if (this.badgeStrum) {
            const strumVal = s.canonical?.strum_pattern || s.metadata?.strum_pattern;
            if (strumVal) {
                this.badgeStrum.textContent = `🪕 ${strumVal}`;
                this.badgeStrum.style.display = "inline-flex";
            } else {
                this.badgeStrum.style.display = "none";
            }
        }
        if (this.badgeReconciliation) {
            const reconLog = this.currentUms?.reconciliation_log || [];
            if (reconLog.length > 0) {
                this.badgeReconciliation.textContent = `⚠️ ${reconLog.length} Discrepanc${reconLog.length === 1 ? 'y' : 'ies'} Reconciled`;
                this.badgeReconciliation.style.display = "inline-flex";
            } else {
                this.badgeReconciliation.style.display = "none";
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
                } else if (!directive.startsWith("end_of_")) {
                    htmlParts.push(`<div class="cp-directive">${this.escapeHtml(line)}</div>`);
                }
            } else if (line.trim()) {
                const chordRegex = /\[(.*?)\]/g;
                let formattedLine = line.replace(chordRegex, '<span class="chordpro-chord">$1</span>');
                htmlParts.push(`<div class="cp-line">${formattedLine}</div>`);
            } else {
                htmlParts.push('<div class="cp-empty-line">&nbsp;</div>');
            }
        });
        this.chordproRendered.innerHTML = htmlParts.join("");
    }

    renderSummary() {
        const s = this.currentScore;
        if (!s) return;

        const title = s.canonical?.title || s.metadata?.title || s.metadata?.subTitle || s.metadata?.name || s.title || "-";
        const artist = s.canonical?.artist || s.metadata?.artist || s.metadata?.music || s.metadata?.words || s.metadata?.author || s.metadata?.composer || s.artist || "-";
        const album = s.canonical?.album || s.metadata?.album || s.metadata?.collection || s.album || "-";
        const composer = s.metadata?.music || s.metadata?.composer || "-";
        const lyricist = s.metadata?.words || s.metadata?.lyricist || "-";
        const transcriber = s.canonical?.transcriber || s.metadata?.tabber || s.metadata?.transcriber || "-";
        const copyright = s.metadata?.copyright || "-";

        // Metadata grid
        this.summaryMetaGrid.innerHTML = `
            <div class="meta-item"><div class="meta-item-label">Title</div><div class="meta-item-value">${title}</div></div>
            <div class="meta-item"><div class="meta-item-label">Artist</div><div class="meta-item-value">${artist}</div></div>
            <div class="meta-item"><div class="meta-item-label">Album</div><div class="meta-item-value">${album}</div></div>
            <div class="meta-item"><div class="meta-item-label">Composer / Music</div><div class="meta-item-value">${composer}</div></div>
            <div class="meta-item"><div class="meta-item-label">Words / Lyrics</div><div class="meta-item-value">${lyricist}</div></div>
            <div class="meta-item"><div class="meta-item-label">Key</div><div class="meta-item-value">${s.canonical?.original_key || s.metadata?.key || "D"}</div></div>
            <div class="meta-item"><div class="meta-item-label">Tempo</div><div class="meta-item-value">${s.canonical?.original_tempo_bpm || s.tempo} BPM</div></div>
            <div class="meta-item"><div class="meta-item-label">Time Signature</div><div class="meta-item-value">${s.getPrimaryTimeSignature ? (s.hasPickupMeasure() ? `${s.getPrimaryTimeSignature()} (${s.masterbars[0].time} pickup)` : s.getPrimaryTimeSignature()) : (s.masterbars[0]?.time || "4/4")}</div></div>
            <div class="meta-item"><div class="meta-item-label">Total Measures</div><div class="meta-item-value">${s.masterbars.length}</div></div>
            <div class="meta-item"><div class="meta-item-label">Strumming Pattern</div><div class="meta-item-value">${s.canonical?.strum_pattern || s.metadata?.strum_pattern || "-"}</div></div>
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

        // Sections Table (From synthesized Structure or GP masterbars)
        const secRows = [];
        if (s.structure && s.structure.length > 0) {
            s.structure.forEach(st => {
                const startM = st.measures[0]?.measure_number || "-";
                const endM = st.measures[st.measures.length - 1]?.measure_number || "-";
                secRows.push(`
                    <tr>
                        <td><strong>${st.block_name}</strong></td>
                        <td>Bars ${startM} – ${endM} (${st.measures.length} measures)</td>
                        <td>${st.section_overrides?.time_signature || s.getPrimaryTimeSignature()}</td>
                        <td>${st.section_overrides?.strum_pattern || (st.section_overrides?.has_pickup ? "Pickup Measure" : "-")}</td>
                    </tr>
                `);
            });
        } else {
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
        }
        this.summarySectionsTableBody.innerHTML = secRows.length > 0 ? secRows.join("") : `<tr><td colspan="4" style="color: var(--text-muted);">No section markers defined in score.</td></tr>`;

        // Reconciliation Table
        const reconLog = this.currentUms?.reconciliation_log || [];
        if (this.summaryReconciliationCard && this.summaryReconciliationTableBody) {
            if (reconLog.length > 0) {
                this.summaryReconciliationCard.style.display = "block";
                this.summaryReconciliationTableBody.innerHTML = reconLog.map(r => `
                    <tr>
                        <td><strong>Bar ${r.measure_number}</strong></td>
                        <td>Beat ${r.beat_division}</td>
                        <td><code>${r.type}</code></td>
                        <td><span class="badge badge-secondary">${r.gp_value || "-"}</span></td>
                        <td><span class="badge badge-info">${r.pdf_value || "-"}</span></td>
                        <td><span style="color: var(--success, #10b981);">${r.resolution || "Resolved"}</span></td>
                    </tr>
                `).join("");
            } else {
                this.summaryReconciliationCard.style.display = "none";
            }
        }

        // Chord Dictionary
        const chords = s.canonical?.chords_detected || s.getAllChords();
        if (chords.length > 0) {
            this.summaryChordsGrid.innerHTML = chords.map(c => `
                <div class="chord-diagram-card">
                    <div class="chord-name">${c}</div>
                    ${renderChordSvg(c)}
                </div>
            `).join("");
        } else {
            this.summaryChordsGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No chord annotations found in score.</p>`;
        }
    }

    renderUms() {
        if (!this.currentScore) return;
        const umsData = this.currentUms || convertToUms(this.currentScore);
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
        const meta = this.currentScore.canonical || this.currentScore.metadata || {};
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
