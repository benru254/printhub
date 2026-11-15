import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Shows the proof of an order: a picture as it is, a PDF as pictures of its first pages.
//   path = the API address of the file (with the customer's key, or a staff address)
export default function ProofView({ path, auth = false, stamp }) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const urls = [];
    setPages(null);
    setError('');
    (async () => {
      try {
        const blob = await api(path, { auth });
        if (blob.type === 'application/pdf') {
          const { openPdf } = await import('../lib/pdfRender.js');
          const pdf = await openPdf(new Uint8Array(await blob.arrayBuffer()));
          const out = [];
          for (let i = 0; i < Math.min(4, pdf.numPages); i++) out.push((await pdf.render(i, 1400)).canvas.toDataURL('image/jpeg', 0.85));
          pdf.destroy();
          if (alive) setPages(out);
        } else {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          if (alive) setPages([url]);
        }
      } catch (e) {
        if (alive) setError(e.message || 'The proof could not be opened.');
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [path, auth, stamp]);

  if (error) return <p className="error">{error}</p>;
  if (!pages) return <p className="hint">Opening the proof…</p>;
  return (
    <div className="proof-pages">
      {pages.map((src, i) => (
        <a key={i} href={src} target="_blank" rel="noreferrer" title="Open bigger">
          <img className="proof-img" src={src} alt={`Proof, page ${i + 1}`} />
        </a>
      ))}
      <p className="hint">Tap the picture to see it bigger. Colours on a screen can look a little different from print.</p>
    </div>
  );
}
