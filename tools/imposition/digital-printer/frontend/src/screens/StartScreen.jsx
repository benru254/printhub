import FileDrop from '../components/FileDrop.jsx';

export default function StartScreen({ onFiles, busy, error }) {
  return (
    <main className="start">
      <h1 className="start-title">Get your design ready for printing</h1>
      <p className="start-sub">
        Choose your file. We show you what it is, how big it is, and turn it into a print-ready sheet with cut marks.
      </p>
      <FileDrop onFiles={onFiles} busy={busy} />
      {error && <p className="error">{error}</p>}
      <p className="privacy">Your file stays on this device until you choose “Send to the shop”.</p>
      <nav className="start-links">
        <a href="#/track">Track an order</a>
        <span aria-hidden>·</span>
        <a href="#/staff">Staff login</a>
      </nav>
    </main>
  );
}
