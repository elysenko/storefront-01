/**
 * Deterministic inline product artwork.
 *
 * The mockup is served as static files with no backend and no guaranteed
 * network egress, so remote image URLs would render as broken tiles. These
 * data-URI SVGs always paint, keeping the catalog grid visually honest.
 * Real `imageUrl` strings from the API drop in unchanged.
 */
const PALETTES: Record<string, [string, string, string]> = {
  electronics: ['#1f2c50', '#3c5488', '#8fa7d8'],
  home: ['#4a3b2a', '#8a6a44', '#dcc4a2'],
  books: ['#243d34', '#3f7059', '#a8ccb9'],
  sports: ['#4a2430', '#8c4157', '#e0aab8'],
  default: ['#22293a', '#4a5670', '#b6c0d4'],
};

export function productImage(theme: string, label: string): string {
  const [dark, mid, light] = PALETTES[theme] ?? PALETTES['default'];
  const initials = label
    .split(' ')
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" role="img" aria-label="${initials}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/>
</linearGradient></defs>
<rect width="480" height="480" fill="url(#g)"/>
<circle cx="368" cy="112" r="132" fill="${light}" opacity="0.22"/>
<circle cx="112" cy="392" r="96" fill="${light}" opacity="0.16"/>
<rect x="96" y="176" width="288" height="152" rx="24" fill="${light}" opacity="0.28"/>
<text x="240" y="278" font-family="Inter,system-ui,sans-serif" font-size="104" font-weight="700"
 fill="${light}" text-anchor="middle" letter-spacing="4">${initials}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n/g, ''))}`;
}
