/**
 * ChordPro / Lead Sheet Generator
 * Converts Guitar Pro score data into ChordPro formatted text.
 */

export function generateChordPro(score, trackIdx = 0) {
    if (!score) return "";

    const lines = [];
    const title = score.metadata?.title || score.metadata?.subTitle || score.metadata?.name || score.title || "Untitled";
    const artist = score.metadata?.artist || score.metadata?.music || score.metadata?.words || score.metadata?.author || score.metadata?.composer || score.artist || "";
    const album = score.metadata?.album || score.metadata?.collection || score.album || "";

    lines.push(`{title: ${title}}`);
    if (artist) lines.push(`{artist: ${artist}}`);
    if (album) lines.push(`{album: ${album}}`);
    lines.push(`{tempo: ${score.tempo}}`);

    const track = score.tracks[trackIdx] || score.tracks[0];
    if (track) {
        lines.push(`{capo: ${track.capo}}`);
        lines.push(`{tuning: ${track.tuningNames.join(" ")}}`);
    }
    lines.push("");

    let currentSection = null;
    const bars = score.getTrackBars(trackIdx);

    bars.forEach(b => {
        if (b.section) {
            if (currentSection) {
                lines.push(`{end_of_${currentSection}}`);
                lines.push("");
            }
            const secName = b.section.name.toLowerCase();
            if (secName.includes("verse")) {
                currentSection = "verse";
                lines.push("{start_of_verse}");
            } else if (secName.includes("chorus")) {
                currentSection = "chorus";
                lines.push("{start_of_chorus}");
            } else if (secName.includes("bridge")) {
                currentSection = "bridge";
                lines.push("{start_of_bridge}");
            } else {
                currentSection = "section";
                lines.push(`# ─── ${b.section.name} ───`);
            }
        }

        const barChords = [];
        b.beats.forEach(beat => {
            if (beat.chord) {
                barChords.push(`[${beat.chord}]`);
            }
        });

        if (barChords.length > 0) {
            lines.push(`| ${barChords.join(" ")} |  (Measure ${b.measureNumber})`);
        } else {
            lines.push(`| · |  (Measure ${b.measureNumber})`);
        }
    });

    if (currentSection) {
        lines.push(`{end_of_${currentSection}}`);
    }

    return lines.join("\n");
}
