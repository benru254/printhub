// Top bar. Simple / Pro switch for everyone; the printer button (Pro only) opens the printer settings.
// showMode: the Simple / Pro switch only matters in the tools, so the shop front does not show it.
export default function Header({ printer, onPrinters, pro, onTogglePro, shopName, onHome, showMode = true }) {
  return (
    <header className="header">
      <a className="logo" href="#/" onClick={(e) => { e.preventDefault(); onHome(); }}>{shopName || 'PrintHub'}</a>
      <span className="header-tool">{showMode && pro ? 'Shop tools' : ''}</span>
      {showMode && <button type="button" className={`mode-switch ${pro ? 'mode-on' : ''}`} onClick={onTogglePro} aria-pressed={pro} title={pro ? 'Pro: all print-shop settings are shown' : 'Simple: only what a customer needs'}>
        {pro ? 'Pro' : 'Simple'}
      </button>}
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
