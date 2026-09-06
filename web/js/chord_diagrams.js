/**
 * Interactive SVG Chord Diagram Generator & WebAudio Synth Voicing Player
 */

export const CHORD_DATABASE = {
    "C":     { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, midi: [48, 52, 55, 60, 64] },
    "Cadd9": { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0], baseFret: 1, midi: [48, 52, 55, 62, 64] },
    "C#":    { frets: [-1, 4, 3, 1, 2, 1], fingers: [0, 4, 3, 1, 2, 1], baseFret: 1, midi: [49, 53, 56, 61, 65] },
    "Db":    { frets: [-1, 4, 3, 1, 2, 1], fingers: [0, 4, 3, 1, 2, 1], baseFret: 1, midi: [49, 53, 56, 61, 65] },
    "D":     { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, midi: [50, 57, 62, 66] },
    "Dadd9": { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1, midi: [50, 57, 62, 64] },
    "Dsus4": { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4], baseFret: 1, midi: [50, 57, 62, 67] },
    "Dsus2": { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1, midi: [50, 57, 62, 64] },
    "D/F#":  { frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3], baseFret: 1, midi: [42, 50, 57, 62, 66] },
    "D#":    { frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3], baseFret: 1, midi: [51, 58, 63, 67] },
    "Eb":    { frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3], baseFret: 1, midi: [51, 58, 63, 67] },
    "E":     { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, midi: [40, 47, 52, 56, 59, 64] },
    "Em":    { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, midi: [40, 47, 52, 55, 59, 64] },
    "Em7":   { frets: [0, 2, 2, 0, 3, 0], fingers: [0, 1, 2, 0, 3, 0], baseFret: 1, midi: [40, 47, 52, 55, 62, 64] },
    "Esus4": { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], baseFret: 1, midi: [40, 47, 52, 57, 59, 64] },
    "E7":    { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1, midi: [40, 47, 50, 56, 59, 64] },
    "F":     { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, midi: [41, 48, 53, 57, 60, 65] },
    "Fmaj7": { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1, midi: [48, 53, 57, 60, 64] },
    "F#":    { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 2, midi: [42, 49, 54, 58, 61, 66] },
    "F#m":   { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 2, midi: [42, 49, 54, 57, 61, 66] },
    "F#7":   { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], baseFret: 2, midi: [42, 49, 52, 58, 61, 66] },
    "F#/C#": { frets: [-1, 4, 4, 3, 2, 2], fingers: [0, 3, 4, 2, 1, 1], baseFret: 2, midi: [49, 54, 58, 61, 66] },
    "G":     { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4], baseFret: 1, midi: [43, 47, 50, 55, 59, 67] },
    "G/B":   { frets: [-1, 2, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4], baseFret: 1, midi: [47, 50, 55, 59, 67] },
    "G#":    { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4, midi: [44, 51, 56, 60, 63, 68] },
    "Ab":    { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4, midi: [44, 51, 56, 60, 63, 68] },
    "A":     { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, midi: [45, 52, 57, 61, 64] },
    "Am":    { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, midi: [45, 52, 57, 60, 64] },
    "A7":    { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0], baseFret: 1, midi: [45, 52, 55, 61, 64] },
    "A7sus4":{ frets: [-1, 0, 2, 0, 3, 0], fingers: [0, 0, 1, 0, 3, 0], baseFret: 1, midi: [45, 52, 55, 62, 64] },
    "Asus2": { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1, midi: [45, 52, 57, 59, 64] },
    "A#":    { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, midi: [46, 53, 58, 62, 65] },
    "Bb":    { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, midi: [46, 53, 58, 62, 65] },
    "B":     { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 2, midi: [47, 54, 59, 63, 66] },
    "Bm":    { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, midi: [47, 54, 59, 62, 66] },
    "Bm7":   { frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3], baseFret: 1, midi: [47, 50, 57, 59, 66] },
    "Bm/D":  { frets: [-1, -1, 0, 4, 3, 2], fingers: [0, 0, 0, 3, 2, 1], baseFret: 1, midi: [50, 54, 59, 62, 66] },
    "Cm":    { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3, midi: [48, 55, 60, 63, 67] },
    "Dm":    { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, midi: [50, 57, 62, 65] }
};

let sharedAudioContext = null;

export function playChordAudio(chordName) {
    try {
        if (!sharedAudioContext) {
            sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (sharedAudioContext.state === "suspended") {
            sharedAudioContext.resume();
        }

        const chord = CHORD_DATABASE[chordName] || CHORD_DATABASE["D"];
        const midiPitches = chord.midi || [50, 57, 62, 66];
        const now = sharedAudioContext.currentTime;

        midiPitches.forEach((midi, idx) => {
            const freq = 440 * Math.pow(2, (midi - 69) / 12);
            const strDelay = idx * 0.035; // Strum spread delay

            const osc = sharedAudioContext.createOscillator();
            const gain = sharedAudioContext.createGain();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now + strDelay);

            // String attack and decay envelope
            gain.gain.setValueAtTime(0.001, now + strDelay);
            gain.gain.exponentialRampToValueAtTime(0.25, now + strDelay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + strDelay + 1.2);

            osc.connect(gain);
            gain.connect(sharedAudioContext.destination);

            osc.start(now + strDelay);
            osc.stop(now + strDelay + 1.25);
        });
    } catch (e) {
        console.warn("WebAudio chord playback warning:", e);
    }
}

export function renderChordSvg(chordName) {
    const chord = CHORD_DATABASE[chordName] || {
        frets: [-1, -1, -1, -1, -1, -1],
        fingers: [0, 0, 0, 0, 0, 0],
        baseFret: 1
    };

    const width = 110;
    const height = 130;
    const marginX = 20;
    const marginTop = 30;
    const numStrings = 6;
    const numFrets = 4;
    const stringSpacing = (width - marginX * 2) / (numStrings - 1);
    const fretSpacing = (height - marginTop - 12) / numFrets;

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="chord-diagram-svg" width="100%" height="auto" role="img" aria-label="Chord diagram for ${chordName}">`;
    svg += `<style>
        .chord-title { font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; fill: #38bdf8; text-anchor: middle; }
        .fret-line { stroke: rgba(148, 163, 184, 0.3); stroke-width: 1.2; }
        .string-line { stroke: rgba(148, 163, 184, 0.45); stroke-width: 1.2; }
        .nut-line { stroke: #cbd5e1; stroke-width: 3.2; stroke-linecap: round; }
        .dot { fill: #0ea5e9; }
        .fret-num { font-size: 9px; fill: #94a3b8; font-family: monospace; }
        .marker { font-size: 10px; font-weight: bold; font-family: monospace; text-anchor: middle; }
        .marker-x { fill: #f43f5e; }
        .marker-o { fill: #10b981; }
    </style>`;

    // Chord Title
    svg += `<text x="${width / 2}" y="16" class="chord-title">${chordName}</text>`;

    // Base Fret indicator if > 1
    if (chord.baseFret > 1) {
        svg += `<text x="${marginX - 12}" y="${marginTop + fretSpacing * 0.7}" class="fret-num">${chord.baseFret}fr</text>`;
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
            svg += `<text x="${x}" y="${marginTop - 5}" class="marker marker-x">×</text>`;
        } else if (fret === 0) {
            svg += `<text x="${x}" y="${marginTop - 5}" class="marker marker-o">○</text>`;
        } else {
            const relFret = fret - chord.baseFret + 1;
            if (relFret >= 1 && relFret <= numFrets) {
                const y = marginTop + (relFret - 0.5) * fretSpacing;
                svg += `<circle cx="${x}" cy="${y}" r="4.8" class="dot" />`;
            }
        }
    });

    svg += `</svg>`;
    return svg;
}
