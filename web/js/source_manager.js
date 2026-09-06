/**
 * Client-Side Source Document & Provenance Manager.
 * Tracks uploaded files, computes SHA-256 hashes using SubtleCrypto,
 * classifies file formats, and maintains source manifests for UMS.
 */

export async function computeSha256(arrayBuffer) {
    if (window.crypto && window.crypto.subtle) {
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback simple checksum if SubtleCrypto unavailable
    let hash = 0;
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < view.length; i++) {
        hash = ((hash << 5) - hash) + view[i];
        hash |= 0;
    }
    return `simple_${Math.abs(hash).toString(16)}`;
}

export function classifyFileType(filename) {
    const nameLower = filename.toLowerCase();
    if (nameLower.endsWith(".gp") || nameLower.endsWith(".gpx") || nameLower.endsWith(".gp5") || nameLower.endsWith(".gp4") || nameLower.endsWith(".gp3") || nameLower.endsWith(".gpif")) {
        return "guitar_pro";
    }
    if (nameLower.endsWith(".chordpro") || nameLower.endsWith(".pro") || nameLower.endsWith(".cho") || nameLower.endsWith(".crd")) {
        return "chordpro";
    }
    if (nameLower.endsWith(".xml") || nameLower.endsWith(".musicxml") || nameLower.endsWith(".mxl")) {
        return "musicxml";
    }
    if (nameLower.endsWith(".mid") || nameLower.endsWith(".midi")) {
        return "midi";
    }
    if (nameLower.endsWith(".pdf")) {
        if (nameLower.includes("chord") || nameLower.includes("lead") || nameLower.includes("chart") || nameLower.includes("rhythm") || nameLower.includes("tab")) {
            return "chord_sheet_pdf";
        }
        if (nameLower.includes("vocal") || nameLower.includes("melody") || nameLower.includes("sing")) {
            return "vocal_score_pdf";
        }
        if (nameLower.includes("piano") || nameLower.includes("acc") || nameLower.includes("keys")) {
            return "piano_score_pdf";
        }
        return "score_pdf";
    }
    if (nameLower.endsWith(".txt")) {
        return "text";
    }
    return "unknown";
}

export class SourceDocument {
    constructor({ sourceId, filename, fileType, buffer, parsedAst = null, role = "supplemental", sha256 = "" }) {
        this.sourceId = sourceId;
        this.filename = filename;
        this.fileType = fileType;
        this.buffer = buffer;
        this.sizeBytes = buffer?.byteLength || 0;
        this.sha256 = sha256;
        this.parsedAst = parsedAst || {};
        this.role = role;
    }

    toManifestEntry(includeRaw = false) {
        const entry = {
            source_id: this.sourceId,
            filename: this.filename,
            file_type: this.fileType,
            role: this.role,
            size_bytes: this.sizeBytes,
            sha256: this.sha256
        };
        if (includeRaw && this.buffer) {
            let binary = "";
            const bytes = new Uint8Array(this.buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            entry.raw_base64 = window.btoa(binary);
        }
        return entry;
    }
}

export class SourceManager {
    constructor() {
        this.sources = new Map();
        this.primaryRhythmSourceId = null;
    }

    async addSource(filename, arrayBuffer, parsedAst = null, roleOverride = null) {
        const sha256 = await computeSha256(arrayBuffer);
        const fileType = classifyFileType(filename);

        // Check if existing
        for (const [id, doc] of this.sources.entries()) {
            if (doc.sha256 === sha256) {
                if (parsedAst) doc.parsedAst = parsedAst;
                return doc;
            }
        }

        const sourceId = `src_${this.sources.size + 1}_${fileType}`;
        let role = roleOverride;
        if (!role) {
            if (fileType === "guitar_pro" || fileType === "musicxml") {
                role = !this.primaryRhythmSourceId ? "primary_rhythm" : "supplemental";
            } else if (fileType === "chord_sheet_pdf" || fileType === "chordpro") {
                role = "harmonic_lead";
            } else if (fileType === "vocal_score_pdf") {
                role = "vocal_melody";
            } else if (fileType === "piano_score_pdf") {
                role = "accompaniment";
            } else {
                role = "supplemental";
            }
        }

        const doc = new SourceDocument({
            sourceId,
            filename,
            fileType,
            buffer: arrayBuffer,
            parsedAst,
            role,
            sha256
        });

        this.sources.set(sourceId, doc);

        if (role === "primary_rhythm" && !this.primaryRhythmSourceId) {
            this.primaryRhythmSourceId = sourceId;
        }

        return doc;
    }

    getSource(sourceId) {
        return this.sources.get(sourceId);
    }

    getPrimaryRhythmSource() {
        if (this.primaryRhythmSourceId && this.sources.has(this.primaryRhythmSourceId)) {
            return this.sources.get(this.primaryRhythmSourceId);
        }
        for (const doc of this.sources.values()) {
            if (["guitar_pro", "musicxml", "midi"].includes(doc.fileType)) {
                return doc;
            }
        }
        return null;
    }

    getAllSources() {
        return Array.from(this.sources.values());
    }

    clear() {
        this.sources.clear();
        this.primaryRhythmSourceId = null;
    }

    toManifest(includeRaw = false) {
        return Array.from(this.sources.values()).map(d => d.toManifestEntry(includeRaw));
    }
}
