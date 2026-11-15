import { useState } from 'react';
import { api } from '../lib/api.js';
import { makeProof } from '../lib/makeProof.js';
import { trackUrl } from '../lib/customer.js';
import { waLink, shopMessages } from '../lib/whatsapp.js';

// The operator's buttons when a job was opened from an order: save the print-ready file
// to the order (no downloading and uploading by hand) and send the customer a proof.
//   order   = ctx.order        outputs = [{ kind, label, build: async () => ({ bytes, name }) }]
//   proofPages = which pages of the design the customer should see (default: front and back)
export default function OrderOutputs({ order, job, outputs = [], disabled, shopName, proofPages }) {
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState('');
  const [proofSent, setProofSent] = useState(false);
  const [error, setError] = useState('');

  async function upload(label, kind, make, done) {
    setBusy(label);
    setError('');
    setSaved('');
    try {
      const { blob, name } = await make();
      const f = new FormData();
      f.append('kind', kind);
      f.append('file', blob, name);
      await api(`/orders/${order.id}/files`, { method: 'POST', auth: true, form: f });
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const saveOutput = (out) =>
    upload(out.kind + out.label, out.kind, async () => {
      const { bytes, name } = await out.build();
      return { blob: new Blob([bytes], { type: 'application/pdf' }), name };
    }, () => setSaved(`${out.label[0].toUpperCase()}${out.label.slice(1)} saved to order ${order.code}.`));

  const sendProof = () =>
    upload('proof', 'proof', async () => {
      const pages = proofPages || (job.geometry.pageCount > 1 ? [0, 1] : [0]);
      const s = order.summary || {};
      const blob = await makeProof(job.pdf, pages, {
        heading: `PROOF · ${shopName} · ${order.code}`,
        lines: [`${order.title} · ${Number(order.quantity).toLocaleString('en-KE')}`, s.detail || [s.size, s.paper].filter(Boolean).join(' · ')].filter(Boolean),
      });
      return { blob, name: `${order.code}-proof.jpg` };
    }, () => setProofSent(true));

  const link = trackUrl(order.code, order.trackKey);
  const message = shopMessages({ ...order, status: 'proof' }, link, shopName)[0];

  return (
    <div className="dialog-actions">
      {outputs.map((out) => (
        <button key={out.kind + out.label} type="button" className="primary" disabled={disabled || !!busy} onClick={() => saveOutput(out)}>
          {busy === out.kind + out.label ? 'Saving…' : `Save ${out.label} to order ${order.code}`}
        </button>
      ))}
      <button type="button" className="ghost-btn wide-btn" disabled={disabled || !!busy} onClick={sendProof}>
        {busy === 'proof' ? 'Making the proof…' : `Send a proof to ${order.customerName.split(' ')[0]} to approve`}
      </button>
      {proofSent && (
        <p className="ok-text">
          Proof sent: the order now waits for the customer.{' '}
          {order.customerPhone && <a className="as-link" href={waLink(order.customerPhone, message.text)} target="_blank" rel="noreferrer">Tell them on WhatsApp</a>}
        </p>
      )}
      {saved && <p className="ok-text">{saved}</p>}
      {(saved || proofSent) && <a className="as-link" href={`#/staff/order/${order.id}`}>Back to the order</a>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
