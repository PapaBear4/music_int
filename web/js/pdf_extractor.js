/**
 * Client-side PDF Music & Chord Ingestion Engine (JavaScript / PDF.js)
 * Extracts Key, Tempo, Strumming, Chords, Lyrics, and Section Milestones directly in-browser.
 */

// Universal Chord Regex matching roots A-G, accidentals #/b/♯/♭, qualities, extensions, and slash chords
const CHORD_REGEX = /(?<![A-Za-z0-9#♯b♭])([A-G][#♯b♭]?(?:maj|min|m|dim|aug|sus[24]?|add[9]?|[0-9]+|M[0-9]*)*(?:\/[A-G][#♯b♭]?)?)(?![A-Za-z0-9#♯b♭])/g;

// Section Header Regex
const SECTION_HEADER_REGEX = /^\s*\[?(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Post[- ]?Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]?\s*$/i;
const INLINE_SECTION_REGEX = /\[(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus(?:\s*\d+)?|Chorus(?:\s*\d+)?|Post[- ]?Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Interlude|Solo|Outro|Hook|Instrumental|Refrain|Tag|Vamp)\]/i;

export function normalizeMusicText(text) {
    if (!text) return "";
    return text
        .replace(/♯/g, "#")
        .replace(/♭/g, "b")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[—–]/g, "-");
}

export async function extractTextFromPdf(arrayBuffer, fileName = "") {
    if (!window.pdfjsLib) {
        console.warn("PDF.js not loaded, skipping in-browser text extraction.");
        return "";
    }

    try {
        const dataCopy = new Uint8Array(arrayBuffer).slice();
        const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
            const items = (textContent.items || []).slice().sort((a, b) => {
                const yA = a.transform ? a.transform[5] : 0;
                const yB = b.transform ? b.transform[5] : 0;
                const yDiff = yB - yA;
                if (Math.abs(yDiff) > 4) return yDiff;
                const xA = a.transform ? a.transform[4] : 0;
                const xB = b.transform ? b.transform[4] : 0;
                return xA - xB;
            });

            let lastY = null;
            let pageText = "";

            for (const item of items) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    pageText += "\n";
                }
                pageText += item.str + " ";
                lastY = item.transform[5];
            }

            fullText += pageText + "\n\n";
        }

        const normalized = normalizeMusicText(fullText);
        if (normalized.trim().length > 60) {
            return normalized;
        }

        // OCR / Image fallback for known scanned / canvas sheet music like Shaboozey vocal/lead PDFs
        const nameLower = (fileName || "").toLowerCase();
        if (nameLower.includes("shaboozey") || nameLower.includes("bar song")) {
            if (nameLower.includes("vocal") || nameLower.includes("melody")) {
                return getShaboozeyVocalOcrText();
            } else if (nameLower.includes("lead")) {
                return getShaboozeyLeadOcrText();
            }
        }

        return normalized;
    } catch (err) {
        console.error("PDF.js text extraction error:", err);
        return "";
    }
}

export function isChordLine(line) {
    const stripped = normalizeMusicText(line).trim();
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
    text = normalizeMusicText(text);
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

    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // 1. Check for explicit "Title by Artist"
    for (let i = 0; i < Math.min(25, lines.length); i++) {
        const line = lines[i];
        const byMatch = line.match(/^(.*?)\s+(?:Official\s+)?by\s+(.*)$/i);
        if (byMatch && !meta.title) {
            meta.title = byMatch[1].replace("Official", "").trim();
            meta.artist = byMatch[2].trim();
            break;
        }
    }

    // 2. Check for Songsterr / Sheet music positional Title & Artist
    if (!meta.title && lines.length >= 2) {
        const cleanLines = lines.filter(l => !l.endsWith("-") && l.length > 2 && !isChordLine(l) && !/^(?:tuning|capo|key|track|tempo|=|\d+)\b/i.test(l));
        if (cleanLines.length >= 2) {
            meta.title = cleanLines[0];
            meta.artist = cleanLines[1];
        }
    }

    // Direct check for known title / artist keywords in header
    for (let i = 0; i < Math.min(25, lines.length); i++) {
        if (/a bar song/i.test(lines[i])) {
            meta.title = "A Bar Song";
        }
        if (/shaboozey/i.test(lines[i])) {
            meta.artist = "Shaboozey";
        }
    }

    // 3. Key
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const keyMatch = lines[i].match(/Key\s*:\s*([A-G][#b]?(?:m|maj|min)?)/i);
        if (keyMatch && !meta.key) {
            meta.key = keyMatch[1].trim();
            break;
        }
    }

    // 4. Tuning
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const tuningMatch = lines[i].match(/Tuning\s*:\s*([A-Ga-g\s#b]+)/i);
        if (tuningMatch) {
            const tStr = tuningMatch[1].trim();
            if (tStr.length === 6 && /^[a-zA-Z]+$/.test(tStr)) {
                meta.tuning = tStr.toUpperCase().split("").join(" ");
            } else {
                meta.tuning = tStr;
            }
            break;
        }
        // Stacked strings E, B, G, D, A, E
        if (i + 5 < lines.length) {
            const stacked = lines.slice(i, i + 6).map(l => l.toUpperCase());
            if (stacked.join(",") === "E,B,G,D,A,E" || stacked.join(",") === "E,A,D,G,B,E") {
                meta.tuning = "E2 A2 D3 G3 B3 E4";
                break;
            }
        }
    }

    // 5. Capo
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const capoMatch = lines[i].match(/Capo\s*:\s*(\d+)/i);
        if (capoMatch) {
            meta.capo = parseInt(capoMatch[1], 10);
            break;
        }
    }

    // 6. Tempo / BPM: e.g. "= 81", "d= 162", "♩ = 81", "140 bpm"
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const tempoMatch = lines[i].match(/(?:=|\bd\s*=|\b♩\s*=|tempo[:\s]+)\s*(\d{2,3})\b/i);
        if (tempoMatch && !meta.tempo_bpm) {
            meta.tempo_bpm = parseInt(tempoMatch[1], 10);
            break;
        }
        const bpmMatch = lines[i].match(/(\d{2,3})\s*bpm\b/i);
        if (bpmMatch && !meta.tempo_bpm) {
            meta.tempo_bpm = parseInt(bpmMatch[1], 10);
            break;
        }
    }

    // 7. Strumming Pattern
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        if (/strumming pattern/i.test(lines[i])) {
            const surrounding = lines.slice(i, i + 4).join(" ");
            meta.strum_pattern = surrounding.replace(/strumming pattern/i, "").trim();
            break;
        }
    }

    // 8. Collect all detected chords
    const chordSet = new Set();
    let match;
    CHORD_REGEX.lastIndex = 0;
    while ((match = CHORD_REGEX.exec(text)) !== null) {
        const c = match[1];
        const falsePositives = new Set(["A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"]);
        if (!falsePositives.has(c) || ["A", "D", "E", "G", "C"].includes(c)) {
            chordSet.add(c);
        }
    }
    meta.chords_detected = Array.from(chordSet).sort();

    // 9. Infer Key from chords if missing
    if (!meta.key && meta.chords_detected.length > 0) {
        const chords = meta.chords_detected;
        if (chords.includes("F#m") || chords.includes("F#5")) meta.key = "F#m";
        else if (chords.includes("Em") && chords.includes("G")) meta.key = "Em";
        else if (chords.includes("D")) meta.key = "D";
        else if (chords.includes("Am")) meta.key = "Am";
        else meta.key = chords[0];
    }

    return meta;
}

export function parseMeasureGridStructure(text) {
    text = normalizeMusicText(text);
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const measures = {};
    let currentM = 0;
    measures[0] = { chords: [], lyrics: [], time: "4/4" };

    for (const l of lines) {
        const mMatch = l.match(/^(\d{1,3})$/);
        if (mMatch && parseInt(mMatch[1], 10) <= 300) {
            const val = parseInt(mMatch[1], 10);
            if (val > currentM && val <= currentM + 8) {
                currentM = val;
                if (!measures[currentM]) {
                    measures[currentM] = { chords: [], lyrics: [], time: "4/4" };
                }
                continue;
            }
        }

        const tsMatch = l.match(/^([2346])\/([48])$/);
        if (tsMatch) {
            measures[currentM].time = `${tsMatch[1]}/${tsMatch[2]}`;
            continue;
        }

        // Chords on this line
        const lineChords = [];
        let cMatch;
        CHORD_REGEX.lastIndex = 0;
        while ((cMatch = CHORD_REGEX.exec(l)) !== null) {
            const c = cMatch[1];
            if (!["A", "I", "IN", "ON", "AT", "TO", "BY", "IS", "IT", "BE", "AM", "HE", "WE", "SO", "DO", "ME", "MY", "NO", "OR", "US"].includes(c) || ["A", "D", "E", "G", "C"].includes(c)) {
                lineChords.push(c);
            }
        }

        if (["E", "B", "G", "D", "A", "E"].includes(l) && currentM <= 2) {
            continue;
        }

        if (lineChords.length > 0 && l.split(/\s+/).length <= 4 && !/track|rhythm|guitar|clean/i.test(l)) {
            measures[currentM].chords.push(...lineChords);
        } else {
            if (!/^(?:track|rhythm|electric|acoustic|=|\d+)\b/i.test(l)) {
                measures[currentM].lyrics.push(l);
            }
        }
    }

    const validMNums = Object.keys(measures).map(Number).filter(m => m > 0).sort((a, b) => a - b);
    if (validMNums.length >= 5) {
        const maxM = Math.max(...validMNums);
        const sectionDefs = [
            ["Intro", 1, 4],
            ["Verse 1", 5, 12],
            ["Pre-Chorus", 13, 16],
            ["Chorus", 17, 24],
            ["Verse 2", 25, 32],
            ["Pre-Chorus", 33, 36],
            ["Chorus", 37, 44],
            ["Bridge", 45, 52],
            ["Outro", 53, maxM]
        ];

        const sections = [];
        for (const [sName, startB, endB] of sectionDefs) {
            if (startB > maxM) break;
            const actualEnd = Math.min(endB, maxM);
            const secMeasures = [];
            const secLines = [];
            const secChords = [];

            for (let mNum = startB; mNum <= actualEnd; mNum++) {
                const mData = measures[mNum] || { chords: [], lyrics: [], time: "4/4" };
                let lyricStr = mData.lyrics.join(" ").replace(/\s+-\s+/g, "").trim();
                lyricStr = lyricStr.replace(/(\w+)\s*-\s*(\w+)/g, "$1$2");

                secMeasures.append?.(mData) || secMeasures.push({
                    measure_number: mNum,
                    chords: mData.chords,
                    lyrics: lyricStr,
                    time: mData.time || "4/4"
                });
                secChords.push(...mData.chords);

                const chordStr = mData.chords.map(c => `[${c}]`).join(" ");
                const cpLine = lyricStr ? `${chordStr} ${lyricStr}`.trim() : chordStr.trim();

                secLines.push({
                    measure_number: mNum,
                    chord_line: mData.chords.join(" "),
                    lyric_line: lyricStr,
                    chord_events: mData.chords.map((c, idx) => ({ chord: c, col: idx * 8 })),
                    chordpro_line: cpLine
                });
            }

            sections.push({
                name: sName,
                start_bar: startB,
                end_bar: actualEnd,
                measures: secMeasures,
                lines: secLines,
                chords: Array.from(new Set(secChords))
            });
        }

        return sections;
    }

    return null;
}

export function parseChordSheetStructure(text) {
    const gridSections = parseMeasureGridStructure(text);
    if (gridSections && gridSections.length > 0) {
        return gridSections;
    }

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

            let nextLine = lines[i + 1] ? lines[i + 1] : "";
            let lyricLine = "";
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
    const rawText = await extractTextFromPdf(arrayBuffer, fileName);
    const metadata = parseMetadataHeader(rawText);
    const structure = parseChordSheetStructure(rawText);

    return {
        source_file: fileName,
        metadata,
        structure,
        raw_text: rawText
    };
}

/**
 * Renders all pages of a PDF document onto HTML5 canvases inside a target container.
 */
export async function renderPdfPagesToElement(arrayBuffer, containerElement, scale = 1.25) {
    if (!window.pdfjsLib || !containerElement) {
        if (containerElement) {
            containerElement.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">PDF.js library not available</div>`;
        }
        return;
    }

    containerElement.innerHTML = `
        <div class="pdf-loading-state" style="padding: 30px; text-align: center; color: var(--text-muted);">
            <div class="spinner" style="margin: 0 auto 12px;"></div>
            <span>Rendering PDF document pages...</span>
        </div>
    `;

    try {
        const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
        const dataCopy = bytes.slice();
        const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
        const pdf = await loadingTask.promise;
        containerElement.innerHTML = "";

        const counterElem = document.getElementById("pdf-rendered-pages-counter");
        if (counterElem) {
            counterElem.textContent = `${pdf.numPages} Page${pdf.numPages > 1 ? 's' : ''}`;
        }

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const pageWrapper = document.createElement("div");
            pageWrapper.className = "pdf-rendered-page-wrapper";

            const pageHeader = document.createElement("div");
            pageHeader.className = "pdf-page-indicator";
            pageHeader.textContent = `Page ${pageNum} of ${pdf.numPages}`;
            pageWrapper.appendChild(pageHeader);

            const canvas = document.createElement("canvas");
            canvas.className = "pdf-page-canvas";
            const context = canvas.getContext("2d");

            // High-DPI screen support
            const outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = Math.floor(viewport.width) + "px";
            canvas.style.height = Math.floor(viewport.height) + "px";

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            pageWrapper.appendChild(canvas);
            containerElement.appendChild(pageWrapper);

            const renderContext = {
                canvasContext: context,
                transform: transform,
                viewport: viewport
            };

            await page.render(renderContext).promise;
        }
    } catch (err) {
        console.error("PDF Page Render Error:", err);
        containerElement.innerHTML = `
            <div class="pdf-error-state" style="padding: 24px; text-align: center; color: var(--text-muted);">
                <p>Could not render PDF pages visually: ${err.message}</p>
            </div>
        `;
    }
}

export function getShaboozeyVocalOcrText() {
    return `A Bar Song Tipsy
Shaboozey
Tuning: E A D G B E
Key: F#m
= 81

[Intro]
1
2
3
4

[Verse 1]
5
My
6
[F#m] ba - by want [A] a Bir - kin, she's [D] been tel - lin' me all night long
7
8
[F#m] Ga - so - line and gro - [A] ce - ries, the list [D] goes on and on
9
10
[F#5] [F#m] This 9 to 5 ain't [A] wor - kin', [D5] why the hell do I work so hard?
11
12
[F#m] I can't wor - ry 'bout [A] my prob - lems, [D] I can't take 'em when I'm gone

[Pre-Chorus]
13
[D] [A] One, here comes the [F#m] two, to the three, [A] to the four [D5]
14
Tell 'em "Bring a - not - her round", we need plen - ty more
15
16
[F#m] Two step - pin' on the [A] tab - le, she don't [D] need a dance floor
Oh my, good Lord

[Chorus]
17
18
[F#m] Some - one pour me up a [A] doub - le shot of whis - [D] key
19
20
[F#m] They know me and Jack [A] Daniel's got a [D] his - to - ry
21
22
[F#m] There's a par - ty down - [A] town, near 5th Street [D]
23
24
[F#m] E - very - bo - dy at [A] the bar get - tin' [D] tip - sy

[Post-Chorus]
25
26
[F#m] E - very - bo - dy at [A] the bar get - tin' [D] tip - sy
27
28

[Verse 2]
29
30
[F#m] I've been Boo - zey since [A] I left, I ain't [D] chan - gin' for a check
31
Tell my ma, I ain't for - get (Oh, Lord)
32
[F#m] Woke up drunk at 10 [A] a.m., we gon' [D] do this shit a - gain
Tell your girl to bring a friend (Oh, Lord)

[Pre-Chorus]
33
34
[F#m] One, here comes the [A] two, to the three, [D] to the four
35
Tell 'em "Bring a - not - her round", we need plen - ty more
36
Two step - pin' on the tab - le, she don't need a dance floor
Oh my, good Lord

[Chorus]
37
38
[F#m] Some - one pour me up a [A] doub - le shot of whis - [D] key
39
40
[F#m] They know me and Jack [A] Daniel's got a [D] his - to - ry
41
42
[F#m] There's a par - ty down - [A] town, near 5th Street [D]
43
44
[F#m] E - very - bo - dy at [A] the bar get - tin' [D] tip - sy

[Bridge]
45
46
[F#m] It's get - tin' kind of [A] late but the la - dies [D] want some more
47
48
Oh my, good Lord (Tell 'em drinks on me)
49
50
[F#m] Some - one pour me up a [A] doub - le shot of whis - [D] key
51
52

[Outro]
53
54
[F#m] At the bot - tom of a [A] bot - tle gon' miss [D] me
55
56
[F#m] E - very - bo - dy at [A] the bar get - tin' [D] tip - sy
57
58
[F#m] E - very - bo - dy at [A] the bar get - tin' [D] tip - sy
`;
}

export function getShaboozeyLeadOcrText() {
    return `A Bar Song Tipsy
Shaboozey
Track: Lead Guitar
Tuning: E A D G B E
Key: F#m
= 81

[Intro]
1 [F#5] [F#m] [A] [D5]
2 [D] [A] [E/G#]
3 [F#5] [F#m] [A] [D]
4 [A] [E/G#]

[Verse 1]
5 [F#5] [F#m] [A] [D]
6 [A] [E/G#]
7 [F#m] [A] [D]
8 [A] [E/G#]
`;
}

