/**
 * Interactive SVG Chord Diagram Generator for Guitar
 */

const CHORD_DATABASE = {
    "Am": { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
    "C": { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
    "G": { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4], baseFret: 1 },
    "D": { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
    "D/F#": { frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3], baseFret: 1 },
    "Fmaj7": { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1 },
    "Dsus4": { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4], baseFret: 1 },
    "E": { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
    "Em": { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1 },
    "E5": { frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 2, 0, 0, 0], baseFret: 1 },
    "G5": { frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0], baseFret: 3 },
    "A5": { frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1 },
    "C5": { frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0], baseFret: 3 },
    "D5": { frets: [-1, 5, 7, 7, -1, -1], fingers: [0, 1, 3, 4, 0, 0], baseFret: 5 },
    "B5": { frets: [-1, 2, 4, 4, -1, -1], fingers: [0, 1, 3, 4, 0, 0], baseFret: 2 },
    "F": { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5 } },
    "A": { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
    "Dm": { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 }
};

export function renderChordSvg(chordName) {
    const chord = CHORD_DATABASE[chordName] || {
        frets: [-1, -1, -1, -1, -1, -1],
        fingers: [0, 0, 0, 0, 0, 0],
        baseFret: 1
    };

    const width = 120;
    const height = 140;
    const marginX = 22;
    const marginTop = 35;
    const numStrings = 6;
    const numFrets = 4;
    const stringSpacing = (width - marginX * 2) / (numStrings - 1);
    const fretSpacing = (height - marginTop - 15) / numFrets;

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="chord-diagram-svg" width="100%" height="auto">`;
    svg += `<style>
        .chord-title { font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700; fill: #60a5fa; text-anchor: middle; }
        .fret-line { stroke: rgba(255,255,255,0.2); stroke-width: 1.5; }
        .string-line { stroke: rgba(255,255,255,0.4); stroke-width: 1.5; }
        .nut-line { stroke: #e2e8f0; stroke-width: 3.5; }
        .dot { fill: #38bdf8; }
        .fret-num { font-size: 10px; fill: #94a3b8; font-family: monospace; }
        .marker { font-size: 11px; font-weight: bold; font-family: monospace; text-anchor: middle; }
        .marker-x { fill: #ef4444; }
        .marker-o { fill: #10b981; }
    </style>`;

    // Chord Title
    svg += `<text x="${width / 2}" y="18" class="chord-title">${chordName}</text>`;

    // Base Fret indicator if > 1
    if (chord.baseFret > 1) {
        svg += `<text x="${marginX - 14}" y="${marginTop + fretSpacing * 0.7}" class="fret-num">${chord.baseFret}fr</text>`;
    }

    // Top Nut line or normal fret line
    if (chord.baseFret === 1) {
        svg += `<line x1="${marginX}" y1="${marginTop}" x2="${width - marginX}" y2="${marginTop}" class="nut-line" />`;
    } else {
        svg += `<line x1="${marginX}" y1="${marginTop}" x2="${width - marginX}" y2="${marginTop}" class="fret-line" />`;
    }

    // Horizontal Fret Lines
    for (let f = 1; f <= numFrets; f++) {
        const y = marginTop + f * fretSpacing;
        svg += `<line x1="${marginX}" y1="${y}" x2="${width - marginX}" y2="${y}" class="fret-line" />`;
    }

    // Vertical String Lines
    for (let s = 0; s < numStrings; s++) {
        const x = marginX + s * stringSpacing;
        svg += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${marginTop + numFrets * fretSpacing}" class="string-line" />`;
    }

    // Dots & Markers (frets array: [LowE, A, D, G, B, HighE])
    chord.frets.forEach((fret, sIdx) => {
        const x = marginX + sIdx * stringSpacing;
        if (fret === -1) {
            svg += `<text x="${x}" y="${marginTop - 6}" class="marker marker-x">×</text>`;
        } else if (fret === 0) {
            svg += `<text x="${x}" y="${marginTop - 6}" class="marker marker-o">○</text>`;
        } else {
            const relFret = fret - chord.baseFret + 1;
            if (relFret >= 1 && relFret <= numFrets) {
                const y = marginTop + (relFret - 0.5) * fretSpacing;
                svg += `<circle cx="${x}" cy="${y}" r="5.5" class="dot" />`;
            }
        }
    });

    svg += `</svg>`;
    return svg;
}
