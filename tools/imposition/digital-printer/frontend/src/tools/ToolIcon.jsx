// Small line icons for each tool (no image files needed).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' };

export default function ToolIcon({ id }) {
  return (
    <svg className="tool-icon" viewBox="0 0 32 32" aria-hidden>
      {ICONS[id] || ICONS.cards}
    </svg>
  );
}

const ICONS = {
  cards: (
    <g {...S}>
      <rect x="4" y="5" width="11" height="7" rx="1" />
      <rect x="17" y="5" width="11" height="7" rx="1" />
      <rect x="4" y="14" width="11" height="7" rx="1" />
      <rect x="17" y="14" width="11" height="7" rx="1" />
      <rect x="4" y="23" width="11" height="5" rx="1" />
      <rect x="17" y="23" width="11" height="5" rx="1" />
    </g>
  ),
  booklet: (
    <g {...S}>
      <path d="M16 8c-3-2-7-2.5-11-2v19c4-.5 8 0 11 2 3-2 7-2.5 11-2V6c-4-.5-8 0-11 2z" />
      <path d="M16 8v19" />
    </g>
  ),
  cutstack: (
    <g {...S}>
      <rect x="6" y="10" width="18" height="16" rx="1" />
      <path d="M9 7h18v16" />
      <path d="M10 15h6M10 19h10" />
    </g>
  ),
  resize: (
    <g {...S}>
      <rect x="5" y="12" width="15" height="15" rx="1" />
      <path d="M17 5h10v10M27 5L18 14" />
    </g>
  ),
  poster: (
    <g {...S}>
      <rect x="6" y="4" width="20" height="24" rx="1" />
      <path d="M16 4v24M6 16h20" strokeDasharray="2 2" />
    </g>
  ),
  gang: (
    <g {...S}>
      <rect x="4" y="4" width="14" height="10" rx="1" />
      <rect x="20" y="4" width="8" height="10" rx="1" />
      <rect x="4" y="16" width="8" height="12" rx="1" />
      <rect x="14" y="16" width="14" height="12" rx="1" />
    </g>
  ),
};
