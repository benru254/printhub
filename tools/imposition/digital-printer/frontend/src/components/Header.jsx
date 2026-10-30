// Top bar. The printer button opens the printer settings from any screen.
export default function Header({ printer, onPrinters }) {
  return (
    <header className="header">
      <span className="logo">PrintHub</span>
      <span className="header-tool">Imposition · Digital printer</span>
      {printer && (
        <button type="button" className="header-printer" onClick={onPrinters} title="Printer settings">
          <svg viewBox="0 0 24 24" aria-hidden className="header-printer-icon">
            <path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          <span className="header-printer-name">{printer.name}</span>
        </button>
      )}
    </header>
  );
}
