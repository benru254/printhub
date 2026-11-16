import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@engine';
import { api, formatWhen } from '../lib/api.js';
import { customer, keyFor, accessQuery, accessBody } from '../lib/customer.js';
import { loadFiles } from '../lib/loadFiles.js';
import { waLink } from '../lib/whatsapp.js';
import { dayText } from '../lib/days.js';
import { PrintSheet } from '../lib/print.jsx';
import PayBox from '../components/PayBox.jsx';
import ProofView from '../components/ProofView.jsx';
import Receipt from '../components/Receipt.jsx';
import ReorderDialog from '../components/ReorderDialog.jsx';

const CLOSED = ['collected', 'cancelled'];

// One line of the order's story, in the customer's words.
function eventText(e, currency) {
  if (e.kind === 'proof') {
    if (e.action === 'sent') return 'Your proof is ready to check';
    if (e.action === 'changes') return 'You asked for a change';
    return 'Proof approved';
  }
  if (e.kind === 'claim') return e.action === 'rejected' ? 'We could not find your payment' : 'You told us you paid';
  if (e.kind === 'payment') return `Payment received: ${formatMoney(e.amount, currency)}`;
  if (e.kind === 'refund') return `Refund: ${formatMoney(e.amount, currency)}`;
  if (e.kind === 'price') return `Price confirmed: ${formatMoney(e.amount, currency)}`;
  if (e.kind === 'file') return 'File received';
  if (e.kind === 'message') return 'Message from the shop';
  return e.statusText || 'Update';
}

// The customer's page for one order: what to do now (approve the proof, send the design,
// pay), then where the order is. Opens from the link (no typing), or with code + phone.
export default function TrackScreen({ code: startCode = '', linkKey = '', shop }) {
  const [code, setCode] = useState(startCode);
  const [phone, setPhone] = useState(() => customer.get().phone || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [actError, setActError] = useState('');
  const [change, setChange] = useState(null); // text of "ask for a change", or null when closed
  const [showProof, setShowProof] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [reorder, setReorder] = useState(false);
  const fileInput = useRef(null);
  const s = shop.shop;

  const accessFor = (c) => ({ key: linkKey || keyFor(c.trim().toUpperCase()), phone });
  const access = order ? { key: order.key } : accessFor(code);

  async function look(c = code, quiet = false) {
    const a = accessFor(c);
    if (!c || (!a.key && !a.phone)) return;
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const r = await api(`/orders/track/${encodeURIComponent(c)}?${accessQuery(a)}`);
      setOrder(r.order);
    } catch (e) {
      if (!quiet) {
        setOrder(null);
        setError(e.message);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  // Opened from a link or "Track my order": look it up straight away.
  useEffect(() => {
    if (startCode) look(startCode);
  }, [startCode, linkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the order is open on the screen, news (a proof, "ready") arrives by itself.
  useEffect(() => {
    if (!order || CLOSED.includes(order.status)) return undefined;
    const t = setInterval(() => look(order.code, true), 30000);
    return () => clearInterval(t);
  }, [order && order.code, order && order.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(label, fn) {
    setBusy(label);
    setActError('');
    try {
      const r = await fn();
      if (r && r.order) setOrder(r.order);
      return true;
    } catch (e) {
      setActError(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  const answerProof = (action, message = '') =>
    act(action, () => api(`/orders/track/${encodeURIComponent(order.code)}/proof`, { method: 'POST', json: { ...accessBody(access), action, message } })).then((ok) => ok && setChange(null));

  const sendFile = (files) =>
    act('file', async () => {
      const loaded = await loadFiles(files);
      const f = new FormData();
      if (access.key) f.append('key', access.key);
      else f.append('phone', access.phone);
      f.append('file', new Blob([loaded.bytes], { type: 'application/pdf' }), `${loaded.name}.pdf`);
      return api(`/orders/track/${encodeURIComponent(order.code)}/files`, { method: 'POST', form: f });
    });

  const proofPath = order ? `/orders/track/${encodeURIComponent(order.code)}/proof?${accessQuery(access)}` : '';
  const lastMessage = order ? [...order.events].reverse().find((e) => e.message && (e.kind === 'status' || e.kind === 'message')) : null;
  const open = order && !CLOSED.includes(order.status);

  return (
    <main className="start track">
      <a className="back-btn as-link" href="#/">‹ {s.name}</a>

      {!order && (
        <>
          <h1 className="start-title">Track your order</h1>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              look();
            }}
          >
            <label className="field-label" htmlFor="tr-code">Order code</label>
            <input id="tr-code" className="num wide-select" placeholder="PH-7K4QX2" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
            <label className="field-label spaced" htmlFor="tr-phone">Phone number you used</label>
            <input id="tr-phone" className="num wide-select" type="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button type="submit" className="primary spaced-top" disabled={loading || !code || !phone}>{loading ? 'Checking…' : 'Check'}</button>
            {error && <p className="error">{error}</p>}
          </form>
          <p className="start-links"><a href="#/orders">All my orders</a></p>
        </>
      )}

      {order && (
        <>
          <div className="card track-result">
            <span className="order-code small">{order.code}</span>
            <div className="track-title">{order.title} · {Number(order.quantity).toLocaleString('en-KE')}</div>
            <div><span className={`status-pill status-${order.status}`}>{order.statusText}</span></div>
            {order.detail && <p className="hint">{order.detail}</p>}
            {order.dueAt && open && <p className="hint">{order.status === 'ready' ? 'Ready now' : `Ready ${dayText(order.dueAt)}`}{order.delivery === 'deliver' ? ` · delivered to ${order.address}` : s.address ? ` · collect at ${s.address}` : ''}</p>}
          </div>

          {order.proof && order.proof.state === 'sent' && (
            <div className="card act-card">
              <h2 className="step-title">Check your proof</h2>
              <p className="hint">This is how it will be printed. Check the spelling, phone numbers and colours. We only print after you approve.</p>
              <ProofView path={proofPath} stamp={order.proof.at} />
              {change === null ? (
                <div className="dialog-actions">
                  <button type="button" className="primary" disabled={!!busy} onClick={() => answerProof('approve')}>{busy === 'approve' ? 'Sending…' : 'Approve — print it'}</button>
                  <button type="button" className="ghost-btn wide-btn" disabled={!!busy} onClick={() => setChange('')}>Something needs to change</button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); answerProof('change', change); }}>
                  <label className="field-label spaced" htmlFor="tr-change">What should we change?</label>
                  <textarea id="tr-change" className="num wide-select text-area" rows={3} maxLength={1000} autoFocus placeholder="e.g. the phone number should be 0712 345 678" value={change} onChange={(e) => setChange(e.target.value)} />
                  <div className="contact-row">
                    <button type="submit" className="primary slim" disabled={!!busy || change.trim().length < 3}>{busy === 'change' ? 'Sending…' : 'Send to the shop'}</button>
                    <button type="button" className="ghost-btn" disabled={!!busy} onClick={() => setChange(null)}>Back</button>
                  </div>
                </form>
              )}
            </div>
          )}
          {order.proof && order.proof.state === 'changes' && (
            <div className="card"><p className="pay-wait">You asked for a change. The shop is working on it and will send a new proof.</p></div>
          )}

          {order.status === 'needs_customer' && lastMessage && (
            <div className="card act-card">
              <h2 className="step-title">The shop needs something from you</h2>
              <p className="customer-notes">{lastMessage.message}</p>
            </div>
          )}

          {open && (order.artwork === 'later' || order.status === 'needs_customer') && (
            <div className="card act-card">
              <h2 className="step-title">{order.artwork === 'later' ? 'Send your design' : 'Send a file'}</h2>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) sendFile(files); }} />
              <div className="dialog-actions">
                <button type="button" className="primary" disabled={!!busy} onClick={() => fileInput.current.click()}>{busy === 'file' ? 'Sending…' : 'Choose the file (PDF or picture)'}</button>
                {s.whatsapp && <a className="ghost-btn wide-btn as-btn-link" href={waLink(s.whatsapp, `Hello, here is the design for order ${order.code}: `)} target="_blank" rel="noreferrer">Send it on WhatsApp instead</a>}
              </div>
            </div>
          )}
          {actError && <p className="error">{actError}</p>}

          {order.money.total > 0 && order.status !== 'cancelled' && (
            <div className="card">
              <div className="money-row">
                <div><span className="hint">Price</span><strong>{formatMoney(order.money.total, order.currency)}</strong></div>
                <div><span className="hint">Paid</span><strong>{formatMoney(order.money.paid, order.currency)}</strong></div>
                <div className={order.money.balance > 0 ? 'money-owed' : 'money-clear'}>
                  <span className="hint">To pay</span><strong>{formatMoney(Math.max(0, order.money.balance), order.currency)}</strong>
                </div>
              </div>
              <PayBox shop={s} code={order.code} access={access} money={order.money} currency={order.currency} claims={order.claims} onOrder={setOrder} />
              {order.lines.length > 0 && (
                <details className="sum-card">
                  <summary>How the price adds up</summary>
                  <ul className="price-lines">
                    {order.lines.map((l, i) => (
                      <li key={i}><span>{l.label}{l.detail ? <small> · {l.detail}</small> : null}</span><span>{formatMoney(l.amount, order.currency)}</span></li>
                    ))}
                    {order.discount > 0 && <li className="price-less"><span>Quantity discount</span><span>−{formatMoney(order.discount, order.currency)}</span></li>}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="card">
            <div className="field-label">What has happened</div>
            <ol className="timeline">
              {[...order.events].reverse().map((e, i) => (
                <li key={i} className="timeline-item">
                  <span className="timeline-when">{formatWhen(e.at)}</span>
                  <span className="timeline-what">{eventText(e, order.currency)}</span>
                  {e.message && (!['file', 'claim'].includes(e.kind) || e.action === 'rejected') && <span className="timeline-msg">{e.message}</span>}
                </li>
              ))}
            </ol>
          </div>

          {order.proof && order.proof.state === 'approved' && (
            <div className="card">
              <button type="button" className="link-btn" onClick={() => setShowProof(!showProof)}>{showProof ? 'Hide' : 'See'} the proof you approved</button>
              {showProof && <ProofView path={proofPath} stamp={order.proof.at} />}
            </div>
          )}

          <div className="dialog-actions">
            {order.canReorder && <button type="button" className="primary" onClick={() => setReorder(true)}>Order this again</button>}
            {s.whatsapp && <a className="ghost-btn wide-btn as-btn-link" href={waLink(s.whatsapp, `Hello, about my order ${order.code}: `)} target="_blank" rel="noreferrer">Message {s.name} on WhatsApp</a>}
            {order.money.total > 0 && <button type="button" className="ghost-btn wide-btn" onClick={() => setPrinting(true)}>{order.money.balance > 0 ? 'Print or save the invoice' : 'Print or save the receipt'}</button>}
          </div>
          <p className="start-links"><a href="#/orders">All my orders</a><span aria-hidden>·</span><a href="#/">Order something else</a></p>

          {reorder && <ReorderDialog order={order} access={access} shop={shop} onClose={() => setReorder(false)} />}
          {printing && <PrintSheet onDone={() => setPrinting(false)}><Receipt order={order} shop={s} /></PrintSheet>}
        </>
      )}
    </main>
  );
}
