/**
 * The product illustrations the seed uses, drawn as vectors here and
 * rasterized into `public/images/products/` by `pnpm product-art`.
 *
 * PNG rather than SVG served directly: the app deliberately rejects
 * user-uploaded SVGs as an XSS vector, and `next/image` will not optimize SVG
 * without `dangerouslyAllowSVG`. Rasterizing keeps both decisions intact.
 */

const INK = "#27272a";
const DARK = "#3f3f46";
const MID = "#71717a";
const LIGHT = "#d4d4d8";
const PALE = "#f4f4f5";
const SCREEN = "#1e293b";
const GLASS = "#bfdbfe";

/** The contact shadow, which anchors the object instead of floating it. */
const shadow = (cx: number, cy: number, rx: number, ry = 18) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.07"/>`;

const frame = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900">` +
  `<rect width="900" height="900" fill="#ffffff"/>${body}</svg>`;

export const ART: Record<string, string> = {
  headphones: frame(`
    ${shadow(450, 700, 210)}
    <path d="M250 470 V420 a200 200 0 0 1 400 0 V470"
          fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
    <rect x="196" y="450" width="112" height="196" rx="46" fill="${DARK}"/>
    <rect x="592" y="450" width="112" height="196" rx="46" fill="${DARK}"/>
    <rect x="220" y="476" width="64" height="144" rx="32" fill="${MID}"/>
    <rect x="616" y="476" width="64" height="144" rx="32" fill="${MID}"/>
    <circle cx="252" cy="548" r="15" fill="${PALE}"/>
    <circle cx="648" cy="548" r="15" fill="${PALE}"/>
  `),

  speaker: frame(`
    ${shadow(450, 648, 216)}
    <rect x="188" y="360" width="524" height="252" rx="126" fill="${DARK}"/>
    <rect x="228" y="398" width="444" height="176" rx="88" fill="${MID}"/>
    <g fill="${DARK}" opacity="0.55">
      ${Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) =>
          `<circle cx="${292 + r * 54}" cy="${434 + c * 36}" r="7"/>`,
        ).join(""),
      ).join("")}
    </g>
    <circle cx="450" cy="640" r="17" fill="${LIGHT}"/>
    <rect x="404" y="330" width="92" height="16" rx="8" fill="${LIGHT}"/>
  `),

  earbuds: frame(`
    ${shadow(450, 690, 200)}
    <rect x="286" y="446" width="328" height="200" rx="60" fill="${DARK}"/>
    <path d="M286 512 h328" stroke="${MID}" stroke-width="6"/>
    <circle cx="450" cy="600" r="16" fill="${MID}"/>
    <g fill="${PALE}" stroke="${LIGHT}" stroke-width="5">
      <path d="M330 300 a54 54 0 0 1 108 0 v34 a34 34 0 0 1 -34 34 h-40 a34 34 0 0 1 -34 -34 z"/>
      <rect x="352" y="360" width="34" height="96" rx="17"/>
      <path d="M462 300 a54 54 0 0 1 108 0 v34 a34 34 0 0 1 -34 34 h-40 a34 34 0 0 1 -34 -34 z"/>
      <rect x="514" y="360" width="34" height="96" rx="17"/>
    </g>
  `),

  laptop: frame(`
    ${shadow(450, 668, 268)}
    <path d="M244 226 h412 a20 20 0 0 1 20 20 v322 H224 V246 a20 20 0 0 1 20 -20 z" fill="${INK}"/>
    <rect x="256" y="258" width="388" height="278" rx="8" fill="${SCREEN}"/>
    <path d="M256 258 h388 v92 h-388 z" fill="${GLASS}" opacity="0.18"/>
    <path d="M150 568 h600 l38 62 a14 14 0 0 1 -12 22 H124 a14 14 0 0 1 -12 -22 z" fill="${DARK}"/>
    <rect x="372" y="596" width="156" height="14" rx="7" fill="${MID}"/>
  `),

  phone: frame(`
    ${shadow(450, 742, 132)}
    <rect x="316" y="146" width="268" height="580" rx="52" fill="${INK}"/>
    <rect x="334" y="164" width="232" height="544" rx="38" fill="${SCREEN}"/>
    <path d="M334 164 h232 v186 h-232 z" fill="${GLASS}" opacity="0.16"/>
    <rect x="412" y="180" width="76" height="14" rx="7" fill="${INK}"/>
    <rect x="352" y="188" width="104" height="104" rx="26" fill="${DARK}"/>
    <circle cx="384" cy="220" r="17" fill="${SCREEN}"/>
    <circle cx="424" cy="220" r="17" fill="${SCREEN}"/>
    <circle cx="384" cy="260" r="17" fill="${SCREEN}"/>
    <rect x="596" y="248" width="10" height="72" rx="5" fill="${DARK}"/>
  `),

  charger: frame(`
    ${shadow(450, 686, 168)}
    <rect x="298" y="288" width="304" height="356" rx="56" fill="${PALE}" stroke="${LIGHT}" stroke-width="6"/>
    <g fill="${MID}">
      <rect x="372" y="196" width="30" height="104" rx="10"/>
      <rect x="498" y="196" width="30" height="104" rx="10"/>
    </g>
    <rect x="352" y="536" width="86" height="30" rx="15" fill="${DARK}"/>
    <rect x="462" y="536" width="86" height="30" rx="15" fill="${DARK}"/>
    <text x="450" y="440" font-family="Inter,Arial,sans-serif" font-size="70"
          font-weight="700" fill="${MID}" text-anchor="middle">65W</text>
  `),

  mouse: frame(`
    ${shadow(450, 726, 148)}
    <path d="M450 196 c108 0 172 92 172 216 v134 c0 106 -74 168 -172 168
             s-172 -62 -172 -168 V412 c0 -124 64 -216 172 -216 z"
          fill="${PALE}" stroke="${LIGHT}" stroke-width="6"/>
    <path d="M450 200 v168" stroke="${LIGHT}" stroke-width="6"/>
    <rect x="434" y="268" width="32" height="86" rx="16" fill="${MID}"/>
    <path d="M278 412 h344" stroke="${LIGHT}" stroke-width="6"/>
  `),

  keyboard: frame(`
    ${shadow(450, 640, 292)}
    <rect x="136" y="344" width="628" height="252" rx="30" fill="${DARK}"/>
    <rect x="158" y="366" width="584" height="208" rx="18" fill="${INK}"/>
    <g fill="${MID}">
      ${Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 13 }, (_, c) =>
          `<rect x="${176 + c * 43}" y="${384 + r * 46}" width="34" height="34" rx="7"/>`,
        ).join(""),
      ).join("")}
    </g>
    <rect x="326" y="568" width="248" height="0" fill="none"/>
  `),

  hub: frame(`
    ${shadow(450, 620, 236)}
    <rect x="228" y="452" width="444" height="136" rx="34" fill="${DARK}"/>
    <g fill="${INK}">
      <rect x="266" y="496" width="70" height="26" rx="8"/>
      <rect x="356" y="496" width="70" height="26" rx="8"/>
      <rect x="446" y="500" width="52" height="18" rx="9"/>
      <rect x="518" y="500" width="52" height="18" rx="9"/>
      <rect x="590" y="494" width="52" height="30" rx="6"/>
    </g>
    <path d="M450 452 V330 a54 54 0 0 1 54 -54 h86"
          fill="none" stroke="${MID}" stroke-width="18" stroke-linecap="round"/>
    <rect x="586" y="252" width="56" height="48" rx="12" fill="${MID}"/>
  `),

  controller: frame(`
    ${shadow(450, 668, 244)}
    <path d="M330 336 h240 c78 0 132 56 152 150 l30 138 c12 56 -22 96 -74 96
             -40 0 -66 -24 -92 -60 l-32 -44 H346 l-32 44 c-26 36 -52 60 -92 60
             -52 0 -86 -40 -74 -96 l30 -138 c20 -94 74 -150 152 -150 z"
          fill="${DARK}"/>
    <g fill="${PALE}">
      <rect x="252" y="440" width="34" height="102" rx="12"/>
      <rect x="218" y="474" width="102" height="34" rx="12"/>
    </g>
    <g fill="${PALE}">
      <circle cx="616" cy="450" r="21"/>
      <circle cx="662" cy="496" r="21"/>
      <circle cx="570" cy="496" r="21"/>
      <circle cx="616" cy="542" r="21"/>
    </g>
    <circle cx="380" cy="580" r="44" fill="${INK}"/>
    <circle cx="380" cy="580" r="28" fill="${MID}"/>
    <circle cx="520" cy="580" r="44" fill="${INK}"/>
    <circle cx="520" cy="580" r="28" fill="${MID}"/>
  `),

  monitor: frame(`
    ${shadow(450, 736, 200)}
    <rect x="112" y="176" width="676" height="404" rx="22" fill="${INK}"/>
    <rect x="136" y="200" width="628" height="342" rx="8" fill="${SCREEN}"/>
    <path d="M136 200 h628 v114 h-628 z" fill="${GLASS}" opacity="0.16"/>
    <rect x="410" y="580" width="80" height="112" fill="${DARK}"/>
    <rect x="298" y="686" width="304" height="34" rx="17" fill="${DARK}"/>
  `),

  "gaming-chair": frame(`
    ${shadow(450, 812, 196)}
    <path d="M300 148 h300 a44 44 0 0 1 44 44 v300 a44 44 0 0 1 -44 44 H300
             a44 44 0 0 1 -44 -44 V192 a44 44 0 0 1 44 -44 z" fill="${DARK}"/>
    <path d="M300 148 h72 v388 h-72 a44 44 0 0 1 -44 -44 V192 a44 44 0 0 1 44 -44 z" fill="${MID}"/>
    <path d="M528 148 h72 a44 44 0 0 1 44 44 v300 a44 44 0 0 1 -44 44 h-72 z" fill="${MID}"/>
    <rect x="372" y="206" width="156" height="34" rx="17" fill="${INK}"/>
    <rect x="336" y="112" width="228" height="76" rx="34" fill="${INK}"/>
    <path d="M272 540 h356 a40 40 0 0 1 40 40 v56 a40 40 0 0 1 -40 40 H272
             a40 40 0 0 1 -40 -40 v-56 a40 40 0 0 1 40 -40 z" fill="${DARK}"/>
    <rect x="428" y="676" width="44" height="76" fill="${MID}"/>
    <path d="M450 752 l-152 58 M450 752 l152 58 M450 752 v58" stroke="${INK}"
          stroke-width="20" stroke-linecap="round" fill="none"/>
    <circle cx="298" cy="818" r="20" fill="${DARK}"/>
    <circle cx="602" cy="818" r="20" fill="${DARK}"/>
    <circle cx="450" cy="818" r="20" fill="${DARK}"/>
  `),
};

/** SKU, or its prefix, to the matching illustration. */
export const ART_BY_SKU: Record<string, keyof typeof ART> = {
  "AUD-001": "headphones",
  "AUD-002": "speaker",
  "AUD-003": "earbuds",
  "LAP-001": "laptop",
  "LAP-002": "laptop",
  "LAP-003": "laptop",
  "TEL-001": "phone",
  "TEL-002": "phone",
  "TEL-003": "phone",
  "ACC-001": "charger",
  "ACC-002": "mouse",
  "ACC-003": "keyboard",
  "ACC-004": "hub",
  "GAM-001": "controller",
  "GAM-002": "monitor",
  "GAM-003": "gaming-chair",
  "DE-AUD-001": "headphones",
  "DE-LAP-001": "laptop",
  "DE-ACC-001": "charger",
};
