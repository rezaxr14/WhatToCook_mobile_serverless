/**
 * Local dish poster used when no photo is available or the photo host is
 * unreachable. Rendered as an inline SVG data URI so it needs no network, no
 * build step and no extra asset request.
 */

const POSTER_COLORS: Array<[string, string]> = [
  ['#c2410c', '#7c2d12'],
  ['#b45309', '#78350f'],
  ['#a16207', '#713f12'],
  ['#4d7c0f', '#1a2e05'],
  ['#0f766e', '#042f2e'],
  ['#7e22ce', '#3b0764'],
  ['#be123c', '#4c0519'],
];

function hash(seed: string): number {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) {
    value = (value * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(value);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap a label so long dish names stay inside the poster. */
function wrap(label: string, maxChars = 18): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxChars) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
    if (lines.length === 2) break;
  }
  if (line && lines.length < 2) lines.push(line);
  return lines.length > 0 ? lines : ['WhatToCook'];
}

/**
 * A gradient poster with the dish name. Stable per name, so the same dish keeps
 * the same artwork across renders and pages.
 */
export function dishPosterDataUri(name: string, width = 800, height = 600): string {
  const label = (name || 'WhatToCook').trim();
  const [from, to] = POSTER_COLORS[hash(label) % POSTER_COLORS.length]!;
  const lines = wrap(label);
  const fontSize = 56;
  const lineHeight = 66;
  const startY = height / 2 + 40 - ((lines.length - 1) * lineHeight) / 2;

  const text = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${startY + index * lineHeight}" text-anchor="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#fff7ed">` +
        `${escapeXml(line)}</text>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
</linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#g)"/>
<g opacity="0.16" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round">
<circle cx="${width - 90}" cy="${height - 90}" r="120"/>
<circle cx="90" cy="90" r="70"/>
</g>
<text x="${width / 2}" y="${startY - 96}" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#ffedd5" opacity="0.75" letter-spacing="6">WHATTOCOOK</text>
${text}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
