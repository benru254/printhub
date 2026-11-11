import FileDrop from '../components/FileDrop.jsx';

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  if (min < 1440) return `${Math.round(min / 60)} hours ago`;
  return `${Math.round(min / 1440)} days ago`;
}

export default function StartScreen({ onFiles, busy, error, shop, resume, onResume, onForget }) {
  return (
    <main className="start">
      <h1 className="start-title">Get your design ready for printing</h1>
      <p className="start-sub">
        Choose your file. We show you what it is, how big it is, what it costs, and turn it into a print-ready sheet.
      </p>
      <FileDrop onFiles={onFiles} busy={busy} />
      {resume && !busy && (
        <div className="resume">
          <button type="button" className="ghost-btn wide-btn" onClick={onResume}>
            Continue with “{resume.name}” <small>· {ago(resume.savedAt || Date.now())}</small>
          </button>
          <button type="button" className="link-btn" onClick={onForget}>Remove it from this device</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="privacy">Your file stays on this device until you choose “Send to the shop”.</p>
      <nav className="start-links">
        <a href="#/track">Track an order</a>
        {shop && shop.whatsapp && (
          <>
            <span aria-hidden>·</span>
            <a href={`https://wa.me/${shop.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp {shop.name}</a>
          </>
        )}
        <span aria-hidden>·</span>
        <a href="#/staff">Staff login</a>
      </nav>
    </main>
  );
}
