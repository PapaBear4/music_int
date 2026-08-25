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
import { FusionHarness } from "./fusion_harness.js";
import { classifyFileType } from "./source_manager.js";

class App {
    constructor() {
        this.currentScore = null;
        this.currentUms = null;
        this.activeTrackIndex = 0;
        this.asciiWrapBars = 2;
        this.activeTabId = "view-visual";
        this.alphaTabApi = null;
        this.currentRawBytes = null;

        // Multi-Source Ingestion & Fusion Harness
        this.fusionHarness = new FusionHarness();
        this.userSteerings = {};
        this.activeConflictFilter = "all";
        this.uploadedFiles = []; // Array of { id, file, name, size, buffer, fileType, parsedAst }

        this.initElements();
        this.initTheme();
        this.initAlphaTab();
        this.initEventListeners();
        this.initIngestModal();
        this.initLlmModal();
        this.initDiscrepancyHud();
        this.initLiveTraces();

        // Default initial load
        this.loadSample("samples/acoustic_fingerstyle.gp");
    }

    initElements() {
        // Theme Select
        this.themeSelect = document.getElementById("theme-select");

        // Tabs
        this.tabButtons = document.querySelectorAll(".tab-btn");
        this.tabPanes = document.querySelectorAll(".tab-pane");
        this.tabConflictBadge = document.getElementById("tab-conflict-badge");

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
        this.modalMultiFileInput = document.getElementById("modal-multi-file-input");
        this.uploadedFilesList = document.getElementById("uploaded-files-list");
        this.uploadedFilesCount = document.getElementById("uploaded-files-count");
        this.emptyFilesPlaceholder = document.getElementById("empty-files-placeholder");
        this.ingestProgressContainer = document.getElementById("ingest-progress-container");
        this.ingestProgressText = document.getElementById("ingest-progress-text");
        this.ingestProgressBarFill = document.getElementById("ingest-progress-bar-fill");
        this.btnFuseUms = document.getElementById("btn-fuse-ums");
        this.btnLoadBundleSample = document.getElementById("btn-load-bundle-sample");
        this.btnClearAllSlots = document.getElementById("btn-clear-all-slots");

        // Global AI Status Indicator
        this.globalAiStatusPill = document.getElementById("global-ai-status-pill");
        this.globalAiStatusText = document.getElementById("global-ai-status-text");

        // LLM Configuration Modal Elements
        this.btnOpenLlmModal = document.getElementById("btn-open-llm-modal");
        this.btnCloseLlmModal = document.getElementById("btn-close-llm-modal");
        this.llmModalBackdrop = document.getElementById("llm-modal-backdrop");
        this.llmProviderSelect = document.getElementById("llm-provider-select");
        this.llmModelInput = document.getElementById("llm-model-input");
        this.llmModelDropdown = document.getElementById("llm-model-dropdown");
        this.btnFetchModels = document.getElementById("btn-fetch-models");
        this.modelsFetchStatus = document.getElementById("models-fetch-status");
        this.availableModelsList = document.getElementById("available-models-list");
        this.llmApiKeyInput = document.getElementById("llm-api-key-input");
        this.btnToggleKeyVisibility = document.getElementById("btn-toggle-key-visibility");
        this.btnSaveLlmConfig = document.getElementById("btn-save-llm-config");
        this.btnTestLlmConnection = document.getElementById("btn-test-llm-connection");
        this.authorityRadios = document.querySelectorAll('input[name="authority-level"]');

        // Discrepancy HUD Elements
        this.btnReRunArbitration = document.getElementById("btn-re-run-arbitration");
        this.btnAcceptAllAi = document.getElementById("btn-accept-all-ai");
        this.discrepancyCardsList = document.getElementById("discrepancy-cards-list");
        this.filterChips = document.querySelectorAll(".filter-chip");
        this.metricConflictCount = document.getElementById("metric-conflict-count");
        this.metricAuthorityMode = document.getElementById("metric-authority-mode");
        this.metricLlmModel = document.getElementById("metric-llm-model");
        this.metricSteeredCount = document.getElementById("metric-steered-count");
        this.filterCountAll = document.getElementById("filter-count-all");
        this.filterCountChord = document.getElementById("filter-count-chord");
        this.filterCountCapo = document.getElementById("filter-count-capo");
        this.filterCountStructure = document.getElementById("filter-count-structure");

        // Live Traces Console Elements
        this.liveTracesStream = document.getElementById("live-traces-stream");
        this.btnClearTraces = document.getElementById("btn-clear-traces");
        this.telemLatency = document.getElementById("telem-latency");
        this.telemPromptTokens = document.getElementById("telem-prompt-tokens");
        this.telemCompTokens = document.getElementById("telem-comp-tokens");

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
                if (e.target.files.length === 1 && !e.target.files[0].name.toLowerCase().endsWith(".pdf")) {
                    this.loadFile(e.target.files[0]);
                } else {
                    this.openIngestModal();
                    this.addUploadedFiles(Array.from(e.target.files));
                }
            }
        });

        // Global Drag & Drop Handlers
        window.addEventListener("dragenter", (e) => {
            e.preventDefault();
            // Don't show full-screen overlay if a modal is already open
            if (!this.ingestModalBackdrop.classList.contains("active") && !this.llmModalBackdrop?.classList.contains("active")) {
                this.dropOverlay.classList.remove("visually-hidden");
            }
        });

        window.addEventListener("dragover", (e) => {
            e.preventDefault();
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
                    this.addUploadedFiles(Array.from(e.dataTransfer.files));
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

        // Multi-file browse input listener
        if (this.modalMultiFileInput) {
            this.modalMultiFileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.addUploadedFiles(Array.from(e.target.files));
                    this.modalMultiFileInput.value = "";
                }
            });
        }

        // Master Batch Dropzone
        if (this.modalBatchDropzone) {
            this.modalBatchDropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.modalBatchDropzone.classList.add("dragover");
            });
            this.modalBatchDropzone.addEventListener("dragleave", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.modalBatchDropzone.classList.remove("dragover");
            });
            this.modalBatchDropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.modalBatchDropzone.classList.remove("dragover");
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.addUploadedFiles(Array.from(e.dataTransfer.files));
                }
            });
            this.modalBatchDropzone.addEventListener("click", (e) => {
                if (e.target.tagName !== "LABEL" && e.target.tagName !== "INPUT") {
                    this.modalMultiFileInput?.click();
                }
            });
        }

        // Support dropping files anywhere on the ingest modal dialog
        const modalDialog = this.ingestModalBackdrop?.querySelector(".modal-dialog");
        if (modalDialog) {
            modalDialog.addEventListener("dragover", (e) => {
                e.preventDefault();
            });
            modalDialog.addEventListener("drop", (e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.addUploadedFiles(Array.from(e.dataTransfer.files));
                }
            });
        }

        // Clear All button
        if (this.btnClearAllSlots) {
            this.btnClearAllSlots.addEventListener("click", () => this.clearAllUploadedFiles());
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

    async addUploadedFiles(fileList) {
        for (const file of fileList) {
            // Avoid duplicate by name and size
            const exists = this.uploadedFiles.some(f => f.name === file.name && f.size === file.size);
            if (exists) continue;

            const buffer = await file.arrayBuffer();
            const fileType = classifyFileType(file.name);
            const id = "src_" + Math.random().toString(36).substring(2, 9);

            this.uploadedFiles.push({
                id,
                file,
                name: file.name,
                size: file.size,
                buffer,
                fileType,
                parsedAst: null
            });
        }

        this.renderUploadedFilesList();
        this.checkFuseReadyState();
    }

    removeUploadedFile(fileId) {
        this.uploadedFiles = this.uploadedFiles.filter(f => f.id !== fileId);
        this.renderUploadedFilesList();
        this.checkFuseReadyState();
    }

    clearAllUploadedFiles() {
        this.uploadedFiles = [];
        this.renderUploadedFilesList();
        this.checkFuseReadyState();
    }

    checkFuseReadyState() {
        const canFuse = this.uploadedFiles.length > 0;
        if (this.btnFuseUms) {
            this.btnFuseUms.disabled = !canFuse;
        }
    }

    renderUploadedFilesList() {
        if (this.uploadedFilesCount) {
            this.uploadedFilesCount.textContent = this.uploadedFiles.length;
        }

        if (!this.uploadedFilesList) return;

        if (this.uploadedFiles.length === 0) {
            this.uploadedFilesList.innerHTML = `
                <div class="empty-files-placeholder">
                    No files uploaded yet. Drag & drop files above or click Browse to begin.
                </div>
            `;
            return;
        }

        this.uploadedFilesList.innerHTML = "";

        const getIconForType = (type, name) => {
            const ext = (name.split(".").pop() || "").toLowerCase();
            if (type === "guitar_pro" || ["gp", "gpx", "gp5", "gp4", "gp3", "gpif"].includes(ext)) return "🎸";
            if (type === "chord_sheet_pdf" || ext === "pdf") return "📑";
            if (type === "musicxml" || ext === "xml") return "🎼";
            if (type === "midi" || ["mid", "midi"].includes(ext)) return "🎹";
            if (type === "chordpro" || ["chordpro", "pro", "cho"].includes(ext)) return "📄";
            return "📝";
        };

        const getBadgeText = (type, name) => {
            const ext = (name.split(".").pop() || "").toLowerCase();
            if (type === "guitar_pro") return "Guitar Pro";
            if (type === "chord_sheet_pdf") return "PDF Lead / Score";
            if (type === "vocal_score_pdf") return "Vocal Score";
            if (type === "musicxml") return "MusicXML";
            if (type === "midi") return "MIDI";
            if (type === "chordpro") return "ChordPro";
            return ext.toUpperCase();
        };

        const formatSize = (bytes) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        this.uploadedFiles.forEach(f => {
            const item = document.createElement("div");
            item.className = "uploaded-file-item";
            item.innerHTML = `
                <div class="file-info-group">
                    <span class="file-icon">${getIconForType(f.fileType, f.name)}</span>
                    <div class="file-text-meta">
                        <span class="file-name-text" title="${f.name}">${f.name}</span>
                        <div class="file-sub-meta">
                            <span>${formatSize(f.size)}</span>
                        </div>
                    </div>
                </div>
                <div class="file-item-actions">
                    <span class="file-format-badge">${getBadgeText(f.fileType, f.name)}</span>
                    <button class="btn-remove-file" title="Remove file" data-id="${f.id}">✕</button>
                </div>
            `;

            item.querySelector(".btn-remove-file").addEventListener("click", () => {
                this.removeUploadedFile(f.id);
            });

            this.uploadedFilesList.appendChild(item);
        });
    }

    /* --------------------------------------------------------------------------
       LLM Provider & Authority Modal Controller
       -------------------------------------------------------------------------- */
    initLlmModal() {
        if (!this.btnOpenLlmModal) return;

        this.btnOpenLlmModal.addEventListener("click", () => this.openLlmModal());
        this.btnCloseLlmModal?.addEventListener("click", () => this.closeLlmModal());
        this.llmModalBackdrop?.addEventListener("click", (e) => {
            if (e.target === this.llmModalBackdrop) this.closeLlmModal();
        });

        // Load persisted LLM state into form
        const cfg = this.fusionHarness.llmClient;
        if (this.llmProviderSelect) this.llmProviderSelect.value = cfg.provider;
        if (this.llmModelInput) this.llmModelInput.value = cfg.model;
        if (this.llmApiKeyInput) this.llmApiKeyInput.value = cfg.apiKey;

        this.authorityRadios?.forEach(r => {
            r.checked = (r.value === cfg.authorityLevel);
            const parentCard = r.closest(".authority-card");
            if (parentCard) parentCard.classList.toggle("selected", r.checked);
            
            r.addEventListener("change", () => {
                this.authorityRadios.forEach(other => {
                    other.closest(".authority-card")?.classList.toggle("selected", other.checked);
                });
            });
        });

        // Model Discovery: Ping server to fetch available models
        this.btnFetchModels?.addEventListener("click", () => this.fetchDiscoveredModels(true));

        // When provider changes, optionally auto-fetch models or update defaults
        this.llmProviderSelect?.addEventListener("change", () => {
            const prov = this.llmProviderSelect.value;
            if (prov === "openrouter") {
                if (!this.llmModelInput.value.includes("/")) {
                    this.llmModelInput.value = "google/gemini-2.5-flash";
                }
            } else if (prov === "gemini") {
                this.llmModelInput.value = "gemini-2.5-flash";
            } else if (prov === "openai") {
                this.llmModelInput.value = "gpt-4o";
            }
            if (this.modelsFetchStatus) this.modelsFetchStatus.textContent = "";
            // Auto fetch if openrouter or key is present
            if (prov === "openrouter" || (this.llmApiKeyInput && this.llmApiKeyInput.value.trim())) {
                this.fetchDiscoveredModels(false);
            }
        });

        // When model selected from dropdown, update text input
        this.llmModelDropdown?.addEventListener("change", () => {
            if (this.llmModelDropdown.value) {
                this.llmModelInput.value = this.llmModelDropdown.value;
            }
        });

        // Model Hint Chips
        document.querySelectorAll(".badge-hint").forEach(chip => {
            chip.addEventListener("click", () => {
                const mod = chip.getAttribute("data-model");
                if (mod && this.llmModelInput) {
                    this.llmModelInput.value = mod;
                    if (this.llmModelDropdown) this.llmModelDropdown.value = mod;
                }
            });
        });

        // Toggle Key Visibility
        this.btnToggleKeyVisibility?.addEventListener("click", () => {
            if (!this.llmApiKeyInput) return;
            const isPassword = this.llmApiKeyInput.type === "password";
            this.llmApiKeyInput.type = isPassword ? "text" : "password";
            this.btnToggleKeyVisibility.textContent = isPassword ? "🔒" : "👁";
        });

        // Save LLM Config
        this.btnSaveLlmConfig?.addEventListener("click", () => {
            const selectedAuthority = document.querySelector('input[name="authority-level"]:checked')?.value || "balanced";
            this.fusionHarness.llmClient.saveConfig({
                provider: this.llmProviderSelect?.value,
                model: this.llmModelInput?.value,
                apiKey: this.llmApiKeyInput?.value,
                authorityLevel: selectedAuthority
            });
            this.updateMetricPills();
            this.closeLlmModal();
            this.showToast("✨ AI Configuration Saved!");
        });

        // Test Connection
        this.btnTestLlmConnection?.addEventListener("click", async () => {
            this.btnTestLlmConnection.disabled = true;
            this.btnTestLlmConnection.textContent = "Testing...";
            try {
                const testResp = await this.fusionHarness.llmClient.reconcileConflicts(
                    "You are a musicology assistant.",
                    { test: true, conflicts_to_reconcile: [] }
                );
                this.showToast("✅ AI Connection Succeeded!");
            } catch (err) {
                this.showToast(`❌ Connection Error: ${err.message}`);
            } finally {
                this.btnTestLlmConnection.disabled = false;
                this.btnTestLlmConnection.textContent = "🔌 Test Connection";
            }
        });
    }

    async fetchDiscoveredModels(showToastNotification = true) {
        if (!this.btnFetchModels) return;

        const provider = this.llmProviderSelect?.value || "openrouter";
        const apiKey = this.llmApiKeyInput?.value || "";

        this.btnFetchModels.disabled = true;
        this.btnFetchModels.textContent = "🔄 Pinging...";
        if (this.modelsFetchStatus) {
            this.modelsFetchStatus.className = "models-status-text";
            this.modelsFetchStatus.textContent = "Pinging API server...";
        }

        try {
            const models = await this.fusionHarness.llmClient.fetchAvailableModels(provider, apiKey);

            // Populate Datalist
            if (this.availableModelsList) {
                this.availableModelsList.innerHTML = "";
                models.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.id;
                    const ctx = m.contextLength > 0 ? ` (${Math.round(m.contextLength / 1000)}k ctx)` : "";
                    opt.textContent = `${m.name}${ctx}`;
                    this.availableModelsList.appendChild(opt);
                });
            }

            // Populate Select Dropdown
            if (this.llmModelDropdown) {
                this.llmModelDropdown.innerHTML = `<option value="">── Select from ${models.length} Discovered Models ──</option>`;
                
                // Group by organization/brand if OpenRouter
                models.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.id;
                    const ctx = m.contextLength > 0 ? ` [${Math.round(m.contextLength / 1000)}k ctx]` : "";
                    opt.textContent = `${m.name || m.id}${ctx} (${m.id})`;
                    this.llmModelDropdown.appendChild(opt);
                });

                this.llmModelDropdown.style.display = "block";

                // If current model matches an option, select it
                if (this.llmModelInput && this.llmModelInput.value) {
                    this.llmModelDropdown.value = this.llmModelInput.value;
                }
            }

            if (this.modelsFetchStatus) {
                this.modelsFetchStatus.className = "models-status-text success";
                this.modelsFetchStatus.textContent = `✅ ${models.length} models discovered`;
            }

            if (showToastNotification) {
                this.showToast(`✨ Successfully discovered ${models.length} models from ${provider.toUpperCase()}`);
            }
        } catch (err) {
            console.error("Model fetch error:", err);
            if (this.modelsFetchStatus) {
                this.modelsFetchStatus.className = "models-status-text error";
                this.modelsFetchStatus.textContent = `❌ ${err.message}`;
            }
            if (showToastNotification) {
                this.showToast(`Fetch error: ${err.message}`);
            }
        } finally {
            this.btnFetchModels.disabled = false;
            this.btnFetchModels.textContent = "🔄 Ping & Fetch Models";
        }
    }

    openLlmModal() {
        this.llmModalBackdrop?.classList.add("active");
        // Trigger background model fetch on modal open if models not yet populated
        if (this.availableModelsList && this.availableModelsList.children.length === 0) {
            this.fetchDiscoveredModels(false);
        }
    }

    closeLlmModal() {
        this.llmModalBackdrop?.classList.remove("active");
    }

    /* --------------------------------------------------------------------------
       Live Instrumentation Traces & Telemetry
       -------------------------------------------------------------------------- */
    initLiveTraces() {
        this.fusionHarness.llmClient.setTraceListener((trace) => {
            if (!this.liveTracesStream) return;
            const entry = document.createElement("div");
            entry.className = `trace-entry ${trace.type}`;
            entry.innerHTML = `
                <span class="trace-time">${trace.time}</span>
                <span class="trace-msg">${trace.message}</span>
            `;
            this.liveTracesStream.appendChild(entry);
            this.liveTracesStream.scrollTop = this.liveTracesStream.scrollHeight;
        });

        this.btnClearTraces?.addEventListener("click", () => {
            if (this.liveTracesStream) {
                this.liveTracesStream.innerHTML = `
                    <div class="trace-entry info">
                        <span class="trace-time">${new Date().toLocaleTimeString()}</span>
                        <span class="trace-msg">Console cleared.</span>
                    </div>
                `;
            }
        });
    }

    /* --------------------------------------------------------------------------
       Discrepancy Inspector & User Steering HUD
       -------------------------------------------------------------------------- */
    initDiscrepancyHud() {
        // Filter Chips
        this.filterChips?.forEach(chip => {
            chip.addEventListener("click", () => {
                this.filterChips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                this.activeConflictFilter = chip.getAttribute("data-filter") || "all";
                this.renderDiscrepancyHud();
            });
        });

        // Re-run AI Arbitration
        this.btnReRunArbitration?.addEventListener("click", async () => {
            this.userSteerings = {};
            await this.fuseAndApplyUms();
        });

        // Accept All AI Proposals
        this.btnAcceptAllAi?.addEventListener("click", () => {
            (this.fusionHarness.discrepancies || []).forEach(d => {
                if (d.proposedResolution) {
                    this.userSteerings[d.conflictId] = d.proposedResolution;
                    d.userOverride = d.proposedResolution;
                }
            });
            this.fuseAndApplyUms();
            this.showToast("Accepted all AI proposed resolutions!");
        });
    }

    updateMetricPills() {
        const total = this.fusionHarness.discrepancies?.length || 0;
        const steered = Object.keys(this.userSteerings).length;
        const cfg = this.fusionHarness.llmClient;

        if (this.metricConflictCount) this.metricConflictCount.textContent = total;
        if (this.metricAuthorityMode) this.metricAuthorityMode.textContent = cfg.authorityLevel.toUpperCase();
        if (this.metricLlmModel) this.metricLlmModel.textContent = cfg.model.split("/").pop();
        if (this.metricSteeredCount) this.metricSteeredCount.textContent = steered;

        if (this.tabConflictBadge) {
            this.tabConflictBadge.textContent = total;
            this.tabConflictBadge.style.display = total > 0 ? "inline-flex" : "none";
        }
    }

    renderDiscrepancyHud() {
        this.updateMetricPills();
        if (!this.discrepancyCardsList) return;

        const allDiscrepancies = this.fusionHarness.discrepancies || [];
        
        // Update filter counters
        const chordCount = allDiscrepancies.filter(d => d.conflictType === "chord_mismatch").length;
        const capoCount = allDiscrepancies.filter(d => d.conflictType === "capo_key_offset").length;
        const structCount = allDiscrepancies.filter(d => d.conflictType === "section_structure").length;

        if (this.filterCountAll) this.filterCountAll.textContent = allDiscrepancies.length;
        if (this.filterCountChord) this.filterCountChord.textContent = chordCount;
        if (this.filterCountCapo) this.filterCountCapo.textContent = capoCount;
        if (this.filterCountStructure) this.filterCountStructure.textContent = structCount;

        // Apply active filter
        const filtered = allDiscrepancies.filter(d => {
            if (this.activeConflictFilter === "all") return true;
            return d.conflictType === this.activeConflictFilter;
        });

        if (filtered.length === 0) {
            this.discrepancyCardsList.innerHTML = `
                <div class="empty-conflicts-state">
                    <div class="empty-icon">✨</div>
                    <h4>No conflicts in this view</h4>
                    <p>All sources are aligned or no conflicts match the active filter '${this.activeConflictFilter}'.</p>
                </div>
            `;
            return;
        }

        this.discrepancyCardsList.innerHTML = "";
        filtered.forEach(d => {
            const isSteered = d.userOverride !== null;
            const currentResolution = d.getEffectiveResolution();
            const gpVal = d.candidates.guitar_pro || "—";
            const pdfVal = d.candidates.chord_sheet_pdf || d.candidates.vocal_score_pdf || "—";
            const confPct = Math.round((d.confidence || 0.8) * 100);

            const card = document.createElement("div");
            card.className = `conflict-card severity-${d.severity} ${isSteered ? 'steered' : ''}`;
            card.innerHTML = `
                <div class="card-top-meta">
                    <div class="card-location-badge">
                        Measure ${d.measureNumber} • Beat ${d.beatDivision} (${d.sectionName})
                    </div>
                    <div class="card-type-tags">
                        <span class="card-type-tag">${d.conflictType.replace(/_/g, " ")}</span>
                        ${isSteered ? '<span class="card-type-tag steered-tag">🎯 User Steered</span>' : ''}
                    </div>
                </div>

                <div class="candidate-compare-grid">
                    <div class="candidate-box">
                        <span class="cand-label">🎸 Guitar Pro</span>
                        <span class="cand-value">${gpVal}</span>
                    </div>
                    <div class="candidate-box">
                        <span class="cand-label">📑 PDF Lead Sheet</span>
                        <span class="cand-value">${pdfVal}</span>
                    </div>
                    <div class="candidate-box">
                        <span class="cand-label">✨ Applied Resolution</span>
                        <span class="cand-value resolution">${currentResolution}</span>
                    </div>
                </div>

                <div class="ai-rationale-box">
                    <div class="ai-rationale-header">
                        <span>🤖 Musical Rationale</span>
                        <div class="confidence-gauge">
                            <span>Confidence: ${confPct}%</span>
                            <div class="confidence-bar"><div class="confidence-fill" style="width:${confPct}%"></div></div>
                        </div>
                    </div>
                    <div>${d.musicalRationale || d.description}</div>
                </div>

                <div class="card-actions-toolbar">
                    <div class="steer-btn-group">
                        <button class="btn btn-secondary btn-sm btn-steer-gp" data-conf="${d.conflictId}">Use GP (${gpVal})</button>
                        <button class="btn btn-secondary btn-sm btn-steer-pdf" data-conf="${d.conflictId}">Use PDF (${pdfVal})</button>
                        <button class="btn btn-primary btn-sm btn-steer-accept" data-conf="${d.conflictId}">Accept AI (${d.proposedResolution})</button>
                    </div>
                    <div class="custom-steer-form">
                        <input type="text" class="custom-steer-input" placeholder="Custom" value="${isSteered ? d.userOverride : ''}">
                        <button class="btn btn-ghost btn-sm btn-steer-custom" data-conf="${d.conflictId}">Set</button>
                    </div>
                </div>
            `;

            // Wire up interactive steer buttons
            card.querySelector(".btn-steer-gp")?.addEventListener("click", () => this.steerDiscrepancy(d.conflictId, gpVal));
            card.querySelector(".btn-steer-pdf")?.addEventListener("click", () => this.steerDiscrepancy(d.conflictId, pdfVal));
            card.querySelector(".btn-steer-accept")?.addEventListener("click", () => this.steerDiscrepancy(d.conflictId, d.proposedResolution));
            
            const customInput = card.querySelector(".custom-steer-input");
            card.querySelector(".btn-steer-custom")?.addEventListener("click", () => {
                if (customInput && customInput.value.trim()) {
                    this.steerDiscrepancy(d.conflictId, customInput.value.trim());
                }
            });

            this.discrepancyCardsList.appendChild(card);
        });

        // Update Telemetry stats
        const lastTelem = this.fusionHarness.llmClient.telemetryHistory.slice(-1)[0];
        if (lastTelem) {
            if (this.telemLatency) this.telemLatency.textContent = `${lastTelem.latencyMs} ms`;
            if (this.telemPromptTokens) this.telemPromptTokens.textContent = lastTelem.tokens?.prompt_tokens || lastTelem.tokens?.promptTokenCount || "N/A";
            if (this.telemCompTokens) this.telemCompTokens.textContent = lastTelem.tokens?.completion_tokens || lastTelem.tokens?.candidatesTokenCount || "N/A";
        }
    }

    setAiWorkingState(isWorking, statusMsg = "AI Arbitrating...") {
        if (!this.globalAiStatusPill) return;

        if (isWorking) {
            this.globalAiStatusPill.className = "ai-status-pill working";
            if (this.globalAiStatusText) this.globalAiStatusText.textContent = statusMsg;
        } else {
            this.globalAiStatusPill.className = "ai-status-pill success";
            if (this.globalAiStatusText) this.globalAiStatusText.textContent = statusMsg;
            setTimeout(() => {
                if (this.globalAiStatusPill.className.includes("success")) {
                    this.globalAiStatusPill.className = "ai-status-pill idle";
                    if (this.globalAiStatusText) this.globalAiStatusText.textContent = "AI Ready";
                }
            }, 3500);
        }
    }

    setIngestProgress(visible, statusMsg = "", percent = 0) {
        if (!this.ingestProgressContainer) return;
        this.ingestProgressContainer.style.display = visible ? "flex" : "none";
        if (this.ingestProgressText) this.ingestProgressText.textContent = statusMsg;
        if (this.ingestProgressBarFill) this.ingestProgressBarFill.style.width = `${percent}%`;
    }

    async steerDiscrepancy(conflictId, chosenValue) {
        this.userSteerings[conflictId] = chosenValue;
        const disc = this.fusionHarness.discrepancies.find(d => d.conflictId === conflictId);
        if (disc) {
            disc.userOverride = chosenValue;
            disc.isResolved = true;
        }

        // Re-fuse locally
        await this.fuseAndApplyUms();
        this.showToast(`Steered ${conflictId} to '${chosenValue}'`);
    }

    async fuseAndApplyUms() {
        const modelName = (this.fusionHarness.llmClient.model || "AI Model").split("/").pop();

        try {
            if (this.uploadedFiles.length === 0 && !this.currentScore) {
                throw new Error("Please upload at least one song file.");
            }

            // Set Loading UI States
            if (this.btnFuseUms) {
                this.btnFuseUms.classList.add("is-loading");
                this.btnFuseUms.disabled = true;
            }
            this.setIngestProgress(true, "1/4 Parsing source documents & extracting layers...", 25);
            this.setAiWorkingState(true, `Querying ${modelName}...`);
            this.showToast(`Synthesizing multi-source UMS with ${modelName}...`);

            let gpScore = null;
            let chordDoc = null;
            let vocalDoc = null;
            let primaryGpBuffer = null;

            // Process all uploaded files dynamically
            for (const item of this.uploadedFiles) {
                const name = item.name.toLowerCase();
                const type = item.fileType;

                if (type === "guitar_pro" || name.endsWith(".gp") || name.endsWith(".gpx") || name.endsWith(".gp5") || name.endsWith(".gp4") || name.endsWith(".gp3") || name.endsWith(".gpif") || name.endsWith(".xml")) {
                    if (!item.parsedAst) {
                        item.parsedAst = await parseGuitarProFile(item.buffer);
                    }
                    if (!gpScore) {
                        gpScore = item.parsedAst;
                        primaryGpBuffer = item.buffer;
                    }
                    await this.fusionHarness.sourceManager.addSource(item.name, item.buffer, item.parsedAst, "primary_rhythm");
                } else if (name.endsWith(".pdf") || name.endsWith(".chordpro") || name.endsWith(".txt")) {
                    if (!item.parsedAst) {
                        item.parsedAst = await parsePdfMusic(item.buffer, item.name);
                    }
                    if (name.includes("vocal") || name.includes("melody")) {
                        vocalDoc = item.parsedAst;
                        await this.fusionHarness.sourceManager.addSource(item.name, item.buffer, item.parsedAst, "vocal_melody");
                    } else {
                        if (!chordDoc) chordDoc = item.parsedAst;
                        await this.fusionHarness.sourceManager.addSource(item.name, item.buffer, item.parsedAst, "harmonic_lead");
                    }
                } else {
                    // Supplemental document
                    await this.fusionHarness.sourceManager.addSource(item.name, item.buffer, null, "supplemental");
                }
            }

            if (!gpScore && this.currentScore) {
                gpScore = this.currentScore;
            }

            if (!gpScore) {
                throw new Error("Please provide at least one Guitar Pro file for the rhythmic notation grid.");
            }

            this.setIngestProgress(true, `2/4 Analyzing macro roadmap & detecting cross-source conflicts...`, 55);

            // Synthesize complete UMS via FusionHarness (Stage 3 & 4)
            this.setIngestProgress(true, `3/4 Reconciling with ${modelName}...`, 75);
            const completeUms = await this.fusionHarness.fuseMultiSource({
                gpScore,
                chordDoc,
                vocalDoc,
                userSteerings: this.userSteerings
            });

            this.setIngestProgress(true, "4/4 Compiling canonical UMS SongGraph...", 95);

            this.currentUms = completeUms;
            this.currentScore = gpScore;
            this.currentScore.canonical = completeUms.canonical;
            this.currentScore.structure = completeUms.structure;

            // Load AlphaTab if raw bytes available
            if (primaryGpBuffer && this.alphaTabApi) {
                this.currentRawBytes = primaryGpBuffer;
                try {
                    this.alphaTabApi.load(new Uint8Array(primaryGpBuffer));
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
            this.renderDiscrepancyHud();

            this.setAiWorkingState(false, "✨ AI Reconciled");
            this.closeIngestModal();
            this.showToast("✨ Canonical UMS Synthesized & Reconciled!");
        } catch (err) {
            console.error("Fusion error:", err);
            this.setAiWorkingState(false, "❌ AI Failed");
            this.showToast(`Fusion Error: ${err.message}`);
        } finally {
            if (this.btnFuseUms) {
                this.btnFuseUms.classList.remove("is-loading");
                this.btnFuseUms.disabled = (this.uploadedFiles.length === 0);
            }
            setTimeout(() => this.setIngestProgress(false), 600);
        }
    }

    async loadBundleSample() {
        try {
            this.showToast("Fetching Ben Rector Multi-Source Bundle...");

            const bundleFiles = [
                { url: "samples/ben_rector_love_like_this.gp", name: "Ben Rector-Love Like This.gp" },
                { url: "samples/ben_rector_chords.pdf", name: "love like this chords.pdf" },
                { url: "samples/ben_rector_vocals.pdf", name: "love like this vocals.pdf" },
                { url: "samples/ben_rector_piano.pdf", name: "love like this piano.pdf" }
            ];

            this.uploadedFiles = [];
            for (const b of bundleFiles) {
                const res = await fetch(b.url);
                const buf = await res.arrayBuffer();
                const fileType = classifyFileType(b.name);
                this.uploadedFiles.push({
                    id: "src_" + Math.random().toString(36).substring(2, 9),
                    file: { name: b.name, size: buf.byteLength },
                    name: b.name,
                    size: buf.byteLength,
                    buffer: buf,
                    fileType,
                    parsedAst: null
                });
            }

            this.renderUploadedFilesList();
            this.checkFuseReadyState();
            this.showToast("✨ Ben Rector Multi-Source Bundle Loaded (4 files)!");
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
