/**
 * Client-side PDF Music & Chord Ingestion Engine (JavaScript / PDF.js)
 * Extracts Key, Tempo, Strumming, Chords, Lyrics, and Section Milestones directly in-browser.
 */

// Universal Chord Regex matching roots A-G, accidentals, qualities, extensions, and slash chords
const CHORD_REGEX = /(?<![A-Za-z0-9#])([A-G][#b]?(?:maj|min|m|dim|aug|sus[24]?|add[9]?|[0-9]+|M[0-9]*)*(?:\/[A-G][#b]?)?)(?![A-Za-z0-9#])/g;

// Section Header Regex
const SECTION_HEADER_REGEX = /^\s*\[?(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]?\s*$/i;
const INLINE_SECTION_REGEX = /\[(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]/i;

export async function extractTextFromPdf(arrayBuffer) {
    if (!window.pdfjsLib) {
        console.warn("PDF.js not loaded, skipping in-browser text extraction.");
        return "";
    }

    try {
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            let lastY = null;
            let pageText = "";

            for (const item of textContent.items) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    pageText += "\n";
                }
                pageText += item.str + " ";
                lastY = item.transform[5];
            }

            fullText += pageText + "\n\n";
        }

        return fullText;
    } catch (err) {
        console.error("PDF.js text extraction error:", err);
        return "";
    }
}

export function isChordLine(line) {
    const stripped = line.trim();
    if (!stripped) return false;
    if (SECTION_HEADER_REGEX.test(stripped)) return false;

    const tokens = stripped.split(/\s+/);
    let chordCount = 0;
    for (const t of tokens) {
        CHORD_REGEX.lastIndex = 0;
        if (CHORD_REGEX.test(t)) chordCount++;
    }

    return tokens.length > 0 && (chordCount / tokens.length) >= 0.5;
}

export function parseMetadataHeader(text) {
    const meta = {
        title: null,
        artist: null,
        key: null,
        tuning: null,
        capo: 0,
        tempo_bpm: null,
        strum_pattern: null,
        chords_detected: []
    };

    const lines = text.split("\n");
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i].trim();

        // Title and Artist
        const byMatch = line.match(/^(.*?)\s+(?:Official\s+)?by\s+(.*)$/i);
        if (byMatch && !meta.title) {
            meta.title = byMatch[1].replace("Official", "").trim();
            meta.artist = byMatch[2].trim();
        }

        // Key
        const keyMatch = line.match(/Key\s*:\s*([A-G][#b]?(?:m|maj|min)?)/i);
        if (keyMatch) meta.key = keyMatch[1].trim();

        // Tuning
        const tuningMatch = line.match(/Tuning\s*:\s*([A-Ga-g\s#b]+)/i);
        if (tuningMatch) meta.tuning = tuningMatch[1].trim();

        // Capo
        const capoMatch = line.match(/Capo\s*:\s*(\d+)/i);
        if (capoMatch) meta.capo = parseInt(capoMatch[1], 10);

        // Tempo
        const bpmMatch = line.match(/(\d+)\s*bpm/i);
        if (bpmMatch) meta.tempo_bpm = parseInt(bpmMatch[1], 10);

        // Strumming Pattern
        if (/STRUMMING PATTERN/i.test(line)) {
            const surrounding = lines.slice(i, i + 4).join(" ");
            meta.strum_pattern = surrounding.replace(/STRUMMING PATTERN/i, "").trim();
        }
    }

    // Collect all chords
    const chordSet = new Set();
    let match;
    CHORD_REGEX.lastIndex = 0;
    while ((match = CHORD_REGEX.exec(text)) !== null) {
        const c = match[1];
        const falsePositives = new Set(["A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"]);
        if (!falsePositives.has(c)) {
            chordSet.add(c);
        }
    }
    meta.chords_detected = Array.from(chordSet).sort();

    return meta;
}

export function parseChordSheetStructure(text) {
    const sections = [];
    let currentSection = null;

    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const stripped = line.trim();

        const secMatch = stripped.match(SECTION_HEADER_REGEX) || stripped.match(INLINE_SECTION_REGEX);
        if (secMatch) {
            const secName = secMatch[1].trim();
            if (currentSection && (currentSection.lines.length > 0 || currentSection.chords.length > 0)) {
                sections.push(currentSection);
            }
            currentSection = {
                name: secName,
                lines: [],
                chords: []
            };
            i++;
            continue;
        }

        if (!currentSection) {
            if (isChordLine(line)) {
                currentSection = { name: "Intro", lines: [], chords: [] };
            } else {
                i++;
                continue;
            }
        }

        if (/tuning:|key:|strumming pattern|bpm|page /i.test(stripped)) {
            i++;
            continue;
        }

        if (isChordLine(line)) {
            const chordLine = line;
            const lineChords = [];
            let cMatch;
            CHORD_REGEX.lastIndex = 0;
            const chordEvents = [];
            while ((cMatch = CHORD_REGEX.exec(chordLine)) !== null) {
                lineChords.push(cMatch[1]);
                chordEvents.push({
                    chord: cMatch[1],
                    col: cMatch.index
                });
            }
            currentSection.chords.push(...lineChords);

            let lyricLine = "";
            const nextLine = (i + 1 < lines.length) ? lines[i + 1] : "";
            if (nextLine.trim() && !isChordLine(nextLine) && !SECTION_HEADER_REGEX.test(nextLine.trim())) {
                lyricLine = nextLine;
                i++;
            }

            // Build ChordPro line
            let chordproLine = "";
            if (lyricLine) {
                let lastIdx = 0;
                const parts = [];
                for (const ce of chordEvents) {
                    if (ce.col < lyricLine.length) {
                        parts.push(lyricLine.slice(lastIdx, ce.col));
                        parts.push(`[${ce.chord}]`);
                        lastIdx = ce.col;
                    } else {
                        if (lastIdx < lyricLine.length) {
                            parts.push(lyricLine.slice(lastIdx));
                            lastIdx = lyricLine.length;
                        }
                        parts.push(` [${ce.chord}]`);
                    }
                }
                if (lastIdx < lyricLine.length) {
                    parts.push(lyricLine.slice(lastIdx));
                }
                chordproLine = parts.join("");
            } else {
                chordproLine = chordEvents.map(ce => `[${ce.chord}]`).join(" ");
            }

            currentSection.lines.push({
                chord_line: chordLine,
                lyric_line: lyricLine,
                chord_events: chordEvents,
                chordpro_line: chordproLine
            });
        } else if (stripped && !isChordLine(line)) {
            currentSection.lines.push({
                chord_line: "",
                lyric_line: stripped,
                chord_events: [],
                chordpro_line: stripped
            });
        }

        i++;
    }

    if (currentSection && (currentSection.lines.length > 0 || currentSection.chords.length > 0)) {
        sections.push(currentSection);
    }

    return sections;
}

export async function parsePdfMusic(arrayBuffer, fileName = "score.pdf") {
    const rawText = await extractTextFromPdf(arrayBuffer);
    const metadata = parseMetadataHeader(rawText);
    const structure = parseChordSheetStructure(rawText);

    return {
        source_file: fileName,
        metadata,
        structure,
        raw_text: rawText
    };
}
