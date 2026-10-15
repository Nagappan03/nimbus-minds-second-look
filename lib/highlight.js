// Splits text into plain and highlighted segments for the given quotes.
// Matching ignores case and differences in whitespace (line breaks, double spaces).

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findRanges(text, quotes) {
  const ranges = [];
  for (const quote of quotes) {
    const words = quote.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const pattern = new RegExp(words.map(escapeRegex).join("\\s+"), "gi");
    for (const m of text.matchAll(pattern)) ranges.push([m.index, m.index + m[0].length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  // Merge overlapping or touching ranges so each character is highlighted once.
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** Returns [{ text, highlight }] covering the whole text in order. */
export function highlightSegments(text, quotes) {
  const segments = [];
  let pos = 0;
  for (const [start, end] of findRanges(text, quotes)) {
    if (start > pos) segments.push({ text: text.slice(pos, start), highlight: false });
    segments.push({ text: text.slice(start, end), highlight: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlight: false });
  return segments;
}
