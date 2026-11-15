import { useEffect, useState } from 'react';
import { formatMoney } from '@engine';
import { api, STATUS_LABELS, ORDER_TOOLS, formatWhen } from '../lib/api.js';
import { downloadBytes } from '../lib/download.js';
import { trackUrl } from '../lib/customer.js';
import { waLink, shopMessages } from '../lib/whatsapp.js';
import { dueText } from '../lib/days.js';
import { PrintSheet } from '../lib/print.jsx';
import Receipt from '../components/Receipt.jsx';
import ProofView from '../components/ProofView.jsx';
import ReorderDialog from '../components/ReorderDialog.jsx';
import MoneyCard from './MoneyCard.jsx';
import JobTicket from './JobTicket.jsx';
import { useOrderMove } from './useOrderMove.jsx';
import { orderBadges } from './orderBadges.js';

const NEXT = ['checking', 'needs_customer', 'approved', 'printing', 'ready', 'collected', 'cancelled'];
const FILE_KIND = { original: 'Customer’s design', reference: 'Customer’s reference', operator: 'Fixed design', imposed: 'Print-ready', proof: 'Proof' };
const SOURCE = { counter: 'typed in at the counter', reorder: 'ordered again', web: 'sent from the customer’s phone' };

const EVENT_TEXT = {
  created: (d) => (d.source === 'counter' ? 'Order typed in at the counter' : d.source === 'reorder' ? 'Ordered again' : 'Order sent by the customer'),
  status: (d) => `Status: ${STATUS_LABELS[d.from] || d.from} → ${STATUS_LABELS[d.status] || d.status}`,
  message: () => 'Message to the customer',
  note: () => 'Note',
  assigned: (d) => (d.to ? 'Assigned' : 'Unassigned'),
  file: (d) => `${d.by === 'customer' ? 'The customer sent a file' : 'File added'} (${FILE_KIND[d.kind] || d.kind}): ${d.name}`,
  edited: (d) => `Changed ${d.field}${d.to !== undefined ? ` to ${d.to}` : ''}`,
  price: (d) => `Price changed: ${formatMoney(d.from)} → ${formatMoney(d.to)}`,
  payment: (d) => `Payment received: ${formatMoney(d.amount)} (${d.method === 'mpesa' ? 'M-Pesa' : d.method})`,
  refund: (d) => `Refund given: ${formatMoney(d.amount)}`,
  proof: (d) => (d.action === 'sent' ? 'Proof sent to the customer' : d.action === 'changes' ? 'The customer asked for a change' : d.by === 'staff' ? 'Proof approved (by phone or WhatsApp)' : 'The customer approved the proof'),
  claim: (d) => (d.action === 'rejected' ? `Payment ${d.reference} not found` : `The customer says they paid (${d.reference})`),
};

function sizeText(bytes) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// One order, laid out in the order the work happens: who and what, the files and the proof,
// the money, then the status and the history.
export default function OrderDetail({ id, me, shop, onBack, onOpenInTool }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [printing, setPrinting] = useState(null); // 'ticket' | 'receipt'
  const [again, setAgain] = useState(false);
  const [waId, setWaId] = useState('');
  const [showProof, setShowProof] = useState(false);
  const { move, busyId, error: moveError, dialog } = useOrderMove(setOrder);

  useEffect(() => {
    let alive = true;
    const load = () => api(`/orders/${id}`, { auth: true }).then((r) => alive && setOrder(r.order)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 30000); // the customer's approval or payment message shows up by itself
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  async function act(label, fn) {
    setBusy(label);
    setError('');
    try {
      const r = await fn();
      if (r && r.order) setOrder(r.order);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  const changeStatus = (status) => {
    if (status === order.status) return act('msg', () => api(`/orders/${id}`, { method: 'PATCH', auth: true, json: { message } })).then((ok) => ok && setMessage(''));
    return move(order, status, { message }).then((ok) => ok && setMessage(''));
  };
  const fetchFile = (f) => api(`/orders/${id}/files/${f.id}`, { auth: true });
  const upload = (kind, file) => {
    const f = new FormData();
    f.append('kind', kind);
    f.append('file', file, file.name);
    return act(`upload-${kind}`, () => api(`/orders/${id}/files`, { method: 'POST', auth: true, form: f }));
  };

  if (!order) {
    return (
      <div className="staff-detail">
        <button type="button" className="back-btn" onClick={onBack}>‹ Orders</button>
        {error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>}
      </div>
    );
  }

  // The newest design that can be opened in a tool: the shop's fixed one, else the customer's.
  const design = [...order.files].reverse().find((f) => f.kind === 'operator' && f.mime === 'application/pdf') || order.files.find((f) => f.kind === 'original' && f.mime === 'application/pdf');
  const toolId = order.recipe?.tool || order.tool;
  const canOpen = design && ORDER_TOOLS[toolId];
  const proofFile = [...order.files].reverse().find((f) => f.kind === 'proof');
  const changeAsked = order.proofState === 'changes' ? [...order.events].reverse().find((e) => e.kind === 'proof' && e.data.action === 'changes') : null;
  const s = order.summary || {};
  const due = dueText(order.dueAt);
  const link = trackUrl(order.code, order.trackKey);
  const messages = shopMessages(order, link, shop.shop.name);
  const wa = messages.find((m) => m.id === waId) || messages[0];
  const closed = ['collected', 'cancelled'].includes(order.status);
  const receipt = {
    ...order, detail: s.detail, currency: (order.quote && order.quote.currency) || 'KES',
    lines: order.quote ? [...(order.quote.lines || []), ...(order.quote.extras || [])] : [],
    discount: (order.quote && order.quote.discount) || 0,
    payments: order.money.entries.filter((e) => e.kind !== 'charge'),
  };

  return (
    <div className="staff-detail">
      <button type="button" className="back-btn" onClick={onBack}>‹ Orders</button>

      <div className="card">
        <div className="order-row-top">
          <span className="order-code small">{order.code}</span>
          <span className={`status-pill status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        </div>
        <div className="track-title">{order.title || ORDER_TOOLS[order.tool]} · <strong>{Number(order.quantity).toLocaleString('en-KE')}</strong></div>
        {s.detail ? (
          <p className="hint">{s.detail}</p>
        ) : (
          <p className="hint">
            {ORDER_TOOLS[order.tool] || order.tool}
            {s.size ? ` · ${s.size}` : ''}
            {s.paper ? ` · ${s.paper} · ${s.colour === false ? 'black & white' : 'colour'}${s.laminate && s.laminate !== 'none' ? ` · ${s.laminate} lamination` : ''}` : ''}
          </p>
        )}
        <p className="hint">
          {[
            s.sheets ? `${s.product ? 'priced as ' : ''}${s.sheets} ${s.sheet || ''} sheets${s.perSheet ? ` · ${s.perSheet} per sheet` : ''}` : '',
            order.quote && order.quote.route === 'offset' ? `offset press · ${order.quote.offset.plates} plates${order.quote.offset.turn ? ' · work and turn' : ''}` : '',
            s.sqm ? `${s.sqm} m²` : '',
            s.numberFrom !== undefined ? `numbers ${s.numberFrom} to ${s.numberTo}` : '',
          ].filter(Boolean).join(' · ')}
        </p>
        <p className="hint">
          {formatWhen(order.createdAt)} · {SOURCE[order.source] || order.source}
          {order.reorderCode ? ` · same as ${order.reorderCode} (design already approved then)` : ''}
          {order.assignedName ? ` · ${order.assignedName} is on it` : ''}
        </p>
        {orderBadges(order).length > 0 && (
          <p className="job-badges">{orderBadges(order).map((b) => <span key={b.text} className={`job-badge job-badge-${b.tone}`}>{b.text}</span>)}</p>
        )}
        {order.delivery === 'deliver' && <p className="customer-notes">Deliver to: {order.address}</p>}
        {order.notes && <p className="customer-notes">“{order.notes}”</p>}
        <div className="contact-row due-row">
          <label className="hint" htmlFor="od-due">Needed by</label>
          <input
            id="od-due"
            className="num"
            type="date"
            value={order.dueAt ? new Date(order.dueAt).toLocaleDateString('en-CA') : ''}
            onChange={(e) => act('due', () => api(`/orders/${id}`, { method: 'PATCH', auth: true, json: { dueAt: e.target.value ? `${e.target.value}T17:00:00` : null } }))}
          />
          {due && !closed && <span className={due.late ? 'due-late' : 'hint'}>{due.text}</span>}
        </div>
        <div className="contact-row">
          <button type="button" className="ghost-btn" onClick={() => setPrinting('ticket')}>Print job ticket</button>
          {order.money.total > 0 && <button type="button" className="ghost-btn" onClick={() => setPrinting('receipt')}>Print {order.money.balance > 0 ? 'invoice' : 'receipt'}</button>}
        </div>
      </div>

      {changeAsked && (
        <div className="card act-card">
          <div className="field-label">The customer asked for a change</div>
          <p className="customer-notes">“{changeAsked.data.message}”</p>
          <p className="hint">Fix the design, then send a new proof below.</p>
        </div>
      )}

      <div className="card">
        <div className="field-label">{order.customerName}</div>
        <div className="contact-row">
          <a className="ghost-btn" href={`tel:${order.customerPhone}`}>Call {order.customerPhone}</a>
          <button type="button" className="ghost-btn" onClick={() => setAgain(true)}>Order again for them</button>
        </div>
        <label className="field-label spaced" htmlFor="od-wa">WhatsApp message</label>
        <select id="od-wa" className="select wide-select" value={wa.id} onChange={(e) => setWaId(e.target.value)}>
          {messages.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="wa-preview">{wa.text}</p>
        <a className="primary as-link" href={waLink(order.customerPhone, wa.text)} target="_blank" rel="noreferrer">Open WhatsApp with this message</a>
      </div>

      <div className="card">
        <div className="field-label">Files and proof</div>
        {!order.files.length && <p className="hint">No files yet{order.artwork === 'later' ? ': the customer will send the design' : order.artwork === 'design' ? ': the shop makes the design' : ''}.</p>}
        <ul className="file-rows">
          {order.files.map((f) => (
            <li key={f.id} className="file-row">
              <span>
                <strong>{FILE_KIND[f.kind] || f.kind}</strong>
                <span className="hint"> · {f.name} · {sizeText(f.size)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}</span>
              </span>
              <button type="button" className="ghost-btn" disabled={!!busy} onClick={() => act('dl', async () => downloadBytes(await (await fetchFile(f)).arrayBuffer(), f.name, f.mime))}>
                Download
              </button>
            </li>
          ))}
        </ul>
        {canOpen && (
          <button type="button" className="primary spaced-top" disabled={!!busy} onClick={() => act('open', async () => onOpenInTool(order, await fetchFile(design), design.name))}>
            {busy === 'open' ? 'Opening…' : `Open in ${ORDER_TOOLS[toolId]}: lay out, save, send proof`}
          </button>
        )}
        {!canOpen && order.files.length > 0 && <p className="hint">To lay it out here, add the finished design as a PDF with “Add fixed design”.</p>}
        <div className="contact-row spaced-top">
          {[['operator', 'Add fixed design'], ['imposed', 'Add print-ready PDF'], ['proof', proofFile ? 'Send a new proof' : 'Send a proof (picture or PDF)']].map(([kind, label]) => (
            <label key={kind} className={`ghost-btn file-pick ${kind === 'proof' ? 'file-pick-main' : ''}`}>
              {busy === `upload-${kind}` ? 'Uploading…' : label}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                hidden
                disabled={closed && kind === 'proof'}
                onChange={(e) => {
                  const file = e.target.files[0];
                  e.target.value = '';
                  if (file) upload(kind, file);
                }}
              />
            </label>
          ))}
        </div>
        {order.proofState && (
          <p className={order.proofState === 'approved' ? 'ok-text' : 'pay-wait'}>
            {order.proofState === 'sent' && 'Proof sent. Waiting for the customer to approve: tell them on WhatsApp (message above).'}
            {order.proofState === 'approved' && 'The proof is approved ✓'}
            {order.proofState === 'changes' && 'The customer asked for a change to the proof.'}
            {proofFile && <> <button type="button" className="link-btn" onClick={() => setShowProof(!showProof)}>{showProof ? 'Hide it' : 'See it'}</button></>}
          </p>
        )}
        {showProof && proofFile && <ProofView path={`/orders/${id}/files/${proofFile.id}`} auth stamp={proofFile.id} />}
      </div>

      <MoneyCard order={order} onChange={setOrder} />

      <div className="card">
        <div className="field-label">Status</div>
        <textarea
          className="num wide-select text-area"
          rows={2}
          maxLength={1000}
          placeholder="Message to the customer (shown on their tracking page). Needed for “Needs customer”."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="chips status-chips">
          {NEXT.map((st) => (
            <button key={st} type="button" className={`chip ${order.status === st ? 'chip-on' : ''}`} disabled={!!busy || !!busyId || order.status === st} onClick={() => changeStatus(st)}>
              <span>{STATUS_LABELS[st]}</span>
            </button>
          ))}
        </div>
        {message && (
          <button type="button" className="ghost-btn spaced-top" disabled={!!busy} onClick={() => changeStatus(order.status)}>
            Send message only
          </button>
        )}
        {order.assignedId !== me.id && (
          <button type="button" className="link-btn spaced-top" disabled={!!busy} onClick={() => act('assign', () => api(`/orders/${id}`, { method: 'PATCH', auth: true, json: { assignedStaffId: me.id } }))}>
            I’m working on this
          </button>
        )}
      </div>

      <div className="card">
        <div className="field-label">History</div>
        <form
          className="note-form"
          onSubmit={(e) => {
            e.preventDefault();
            act('note', () => api(`/orders/${id}/notes`, { method: 'POST', auth: true, json: { text: note } })).then((ok) => ok && setNote(''));
          }}
        >
          <input className="num wide-select" placeholder="Staff note (customer can’t see it)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="ghost-btn" disabled={!note.trim() || !!busy}>Add</button>
        </form>
        <ol className="timeline">
          {[...order.events].reverse().map((e) => (
            <li key={e.id} className="timeline-item">
              <span className="timeline-when">
                {formatWhen(e.at)} · {e.staffName || 'Customer'}
                {e.public ? ' · customer sees this' : ''}
              </span>
              <span className="timeline-what">{(EVENT_TEXT[e.kind] || (() => e.kind))(e.data)}</span>
              {(e.data.message || e.data.text) && e.kind !== 'claim' && <span className="timeline-msg">{e.data.message || e.data.text}</span>}
            </li>
          ))}
        </ol>
      </div>

      {(error || moveError) && <p className="error">{error || moveError}</p>}
      {dialog}
      {again && (
        <ReorderDialog
          order={{ code: order.code, title: order.title, quantity: order.quantity, productId: order.productId, choice: order.recipe?.product?.choice, detail: s.detail }}
          shop={shop}
          staffOrderId={order.id}
          onClose={() => setAgain(false)}
        />
      )}
      {printing && (
        <PrintSheet onDone={() => setPrinting(null)}>
          {printing === 'ticket' ? <JobTicket order={order} /> : <Receipt order={receipt} shop={shop.shop} />}
        </PrintSheet>
      )}
    </div>
  );
}
