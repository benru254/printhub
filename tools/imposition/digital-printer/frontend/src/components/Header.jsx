// Top bar. Simple / Pro switch for everyone; the printer button (Pro only) opens the printer settings.
export default function Header({ printer, onPrinters, pro, onTogglePro, shopName }) {
  return (
    <header className="header">
      <a className="logo" href="#/">{shopName && shopName !== 'PrintHub' ? shopName : 'PrintHub'}</a>
      <span className="header-tool">{pro ? 'Imposition · Digital printer' : 'Print it yourself'}</span>
      <button type="button" className={`mode-switch ${pro ? 'mode-on' : ''}`} onClick={onTogglePro} aria-pressed={pro} title={pro ? 'Pro: all print-shop settings are shown' : 'Simple: only what a customer needs'}>
        {pro ? 'Pro' : 'Simple'}
      </button>
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
