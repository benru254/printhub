// Small line pictures for the products (no image files to load on a slow phone).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round', strokeLinecap: 'round' };

const ICONS = {
  card: (
    <g {...S}>
      <rect x="4" y="9" width="24" height="15" rx="2" />
      <path d="M8 14h7M8 18h11M22 14h2" />
    </g>
  ),
  flyer: (
    <g {...S}>
      <rect x="8" y="4" width="16" height="24" rx="1.5" />
      <path d="M11 9h10M11 13h10M11 17h6" />
      <rect x="11" y="20" width="10" height="5" rx="1" />
    </g>
  ),
  poster: (
    <g {...S}>
      <rect x="6" y="4" width="20" height="24" rx="1.5" />
      <path d="M9 21l5-6 4 4 3-3 2 3" />
      <circle cx="12" cy="10" r="2" />
    </g>
  ),
  invite: (
    <g {...S}>
      <rect x="5" y="8" width="22" height="16" rx="2" />
      <path d="M5 10l11 8 11-8" />
    </g>
  ),
  certificate: (
    <g {...S}>
      <rect x="4" y="6" width="24" height="17" rx="1.5" />
      <path d="M9 11h14M9 15h9" />
      <circle cx="22" cy="20" r="3" />
      <path d="M20.5 22.5L19.5 27l2.5-1.5L24.5 27l-1-4.5" />
    </g>
  ),
  letterhead: (
    <g {...S}>
      <rect x="8" y="4" width="16" height="24" rx="1.5" />
      <rect x="11" y="7" width="4" height="3" rx="0.5" />
      <path d="M17 8.5h4M11 14h10M11 18h10M11 22h6" />
    </g>
  ),
  sticker: (
    <g {...S}>
      <path d="M16 4a12 12 0 1 0 12 12h-7a5 5 0 0 1-5-5z" />
      <path d="M16 4l12 12" />
    </g>
  ),
  booklet: (
    <g {...S}>
      <path d="M16 8c-3-2-7-2.5-11-2v19c4-.5 8 0 11 2 3-2 7-2.5 11-2V6c-4-.5-8 0-11 2z" />
      <path d="M16 8v19" />
    </g>
  ),
  book: (
    <g {...S}>
      <rect x="9" y="5" width="17" height="22" rx="1" />
      <rect x="5" y="5" width="4" height="22" rx="1" />
      <path d="M13 11h9M13 15h9M13 19h6" />
    </g>
  ),
  receipt: (
    <g {...S}>
      <path d="M8 4h16v24l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L8 28z" />
      <path d="M11 9h6M20 9h1M11 13h10M11 17h10M17 21h4" />
    </g>
  ),
  banner: (
    <g {...S}>
      <rect x="3" y="9" width="26" height="14" rx="1" />
      <circle cx="6" cy="12" r="0.8" />
      <circle cx="26" cy="12" r="0.8" />
      <circle cx="6" cy="20" r="0.8" />
      <circle cx="26" cy="20" r="0.8" />
      <path d="M10 14h12M10 18h8" />
    </g>
  ),
  rollup: (
    <g {...S}>
      <rect x="10" y="3" width="12" height="22" rx="1" />
      <path d="M7 28h18M16 25v3M13 8h6M13 12h6M13 16h4" />
    </g>
  ),
  vinyl: (
    <g {...S}>
      <rect x="4" y="5" width="24" height="18" rx="1.5" />
      <path d="M4 18l8-8M4 12l5-5M14 23l14-14M21 23l7-7M9 27h14M16 23v4" />
    </g>
  ),
  canvas: (
    <g {...S}>
      <rect x="5" y="5" width="22" height="17" rx="1" />
      <path d="M8 18l5-6 4 4 3-3 4 5" />
      <path d="M11 22l-3 6M21 22l3 6M16 22v5" />
    </g>
  ),
};

export const PRODUCT_ICONS = Object.keys(ICONS);

export default function ProductIcon({ id, className = 'product-icon' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      {ICONS[id] || ICONS.flyer}
    </svg>
  );
}
