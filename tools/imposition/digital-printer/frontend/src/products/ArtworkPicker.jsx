import { useRef } from 'react';
import { formatMoney } from '@engine';

const ICON = { good: '✓', check: 'i', low: '!' };

// "Your design": most customers do NOT have a print-ready file. So there are three honest
// answers: here it is, please make one for me, or I will send it later.
//   file = { name, thumb, pages } once a file is chosen     check = checkArtwork() result
export default function ArtworkPicker({ artwork, onArtwork, file, check, busy, error, onFiles, onRemove, designFee, currency }) {
  const input = useRef(null);
  const options = [
    { value: 'upload', title: 'I have my design', sub: 'PDF or picture' },
    { value: 'design', title: 'Design it for me', sub: designFee > 0 ? `+ ${formatMoney(designFee, currency)}` : 'free' },
    { value: 'later', title: 'I’ll send it later', sub: 'here or on WhatsApp' },
  ];
  const pickText = artwork === 'design' ? 'Add your logo or a photo (optional)' : 'Choose your file';

  return (
    <div>
      <div className="art-options" role="radiogroup" aria-label="Your design">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={artwork === o.value} className={`art-option ${artwork === o.value ? 'art-on' : ''}`} onClick={() => onArtwork(o.value)}>
            <span className="art-title">{o.title}</span>
            <span className="art-sub">{o.sub}</span>
          </button>
        ))}
      </div>

      {artwork !== 'later' && (
        <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...e.target.files];
              e.target.value = '';
              if (files.length) onFiles(files);
            }}
          />
          {file ? (
            <div className="art-file">
              {file.thumb && <img className="art-thumb" src={file.thumb} alt="Your design, first page" />}
              <div className="art-file-text">
                <strong>{file.name}</strong>
                <span className="hint">{file.pages} {file.pages === 1 ? 'page' : 'pages'}</span>
                <span className="art-file-actions">
                  <button type="button" className="link-btn" onClick={() => input.current.click()} disabled={busy}>Change</button>
                  <button type="button" className="link-btn" onClick={onRemove} disabled={busy}>Remove</button>
                </span>
              </div>
            </div>
          ) : (
            <button type="button" className={`art-pick ${artwork === 'upload' ? 'art-pick-main' : ''}`} onClick={() => input.current.click()} disabled={busy}>
              {busy ? 'Reading your file…' : pickText}
              {!busy && artwork === 'upload' && <small>For front and back pictures, choose both</small>}
            </button>
          )}
          {error && <p className="error">{error}</p>}
          {file && check && artwork === 'upload' && (
            <ul className="art-check">
              {check.lines.map((l, i) => (
                <li key={i} className={`art-line artl-${l.level}`}><span className="art-mark" aria-hidden>{ICON[l.level]}</span><span>{l.text}</span></li>
              ))}
            </ul>
          )}
        </>
      )}
      {artwork === 'design' && <p className="hint">Tell us what you want in the notes below: names, phone numbers, colours. You approve the design before we print.</p>}
      {artwork === 'later' && <p className="hint">Send your order now to book your place. You get a link to send the design when it is ready.</p>}
    </div>
  );
}
