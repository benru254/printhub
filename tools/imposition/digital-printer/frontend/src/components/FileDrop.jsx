import { useRef, useState } from 'react';

// Big, thumb-friendly file picker. Also accepts drag & drop on desktop.
// Accepts one PDF, or one or more pictures.
export default function FileDrop({ onFiles, busy, compact = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (files) => {
    if (files && files.length) onFiles(files);
  };

  return (
    <div
      className={`drop ${over ? 'drop-over' : ''} ${compact ? 'drop-compact' : ''}`}
      onClick={() => !busy && input.current.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        hidden
        onChange={(e) => {
          pick([...e.target.files]);
          e.target.value = '';
        }}
      />
      {busy ? (
        <span className="drop-title">Reading your file…</span>
      ) : compact ? (
        <span className="drop-title">Change file</span>
      ) : (
        <>
          <span className="drop-icon" aria-hidden>⬆</span>
          <span className="drop-title">Choose your file</span>
          <span className="drop-sub">PDF, JPG or PNG. For front and back pictures, choose both.</span>
        </>
      )}
    </div>
  );
}
