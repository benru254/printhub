import { useEffect, useState } from 'react';
import { api, STATUS_LABELS, ORDER_TOOLS, formatWhen } from '../lib/api.js';
import { downloadBytes } from '../lib/download.js';

const NEXT = ['checking', 'needs_customer', 'approved', 'printing', 'ready', 'collected', 'cancelled'];

const EVENT_TEXT = {
  created: () => 'Order sent by the customer',
  status: (d) => `Status: ${STATUS_LABELS[d.from] || d.from} → ${STATUS_LABELS[d.status] || d.status}`,
  message: () => 'Message to the customer',
  note: () => 'Note',
  assigned: (d) => (d.to ? 'Assigned' : 'Unassigned'),
  file: (d) => `File added (${d.kind}): ${d.name}`,
  edited: (d) => `Changed ${d.field}${d.to !== undefined ? ` to ${d.to}` : ''}`,
};

function sizeText(bytes) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// One order: customer, files, the customer's settings, status, messages and notes.
export default function OrderDetail({ id, me, onBack, onOpenInTool }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api(`/orders/${id}`, { auth: true }).then((r) => setOrder(r.order)).catch((e) => setError(e.message));
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

  const changeStatus = (status) =>
    act(status, () => api(`/orders/${id}`, { method: 'PATCH', auth: true, json: { status, message } })).then((ok) => ok && setMessage(''));

  const fetchFile = (f) => api(`/orders/${id}/files/${f.id}`, { auth: true });

  if (!order) {
    return (
      <div className="staff-detail">
        <button type="button" className="back-btn" onClick={onBack}>‹ Orders</button>
        {error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>}
      </div>
    );
  }

  const original = order.files.find((f) => f.kind === 'original');
  const canOpen = original && ORDER_TOOLS[order.recipe?.tool || order.tool] && original.mime === 'application/pdf';
  const waPhone = order.customerPhone.replace(/\D/g, '');
  const s = order.summary || {};

  return (
    <div className="staff-detail">
      <button type="button" className="back-btn" onClick={onBack}>‹ Orders</button>

      <div className="card">
        <div className="order-row-top">
          <span className="order-code small">{order.code}</span>
          <span className={`status-pill status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        </div>
        <div className="track-title">{order.title || ORDER_TOOLS[order.tool]} · <strong>{order.quantity}</strong></div>
        <p className="hint">
          {ORDER_TOOLS[order.tool] || order.tool}
          {s.size ? ` · ${s.size}` : ''}
          {s.pages ? ` · ${s.pages} ${s.pages === 1 ? 'page' : 'pages'}` : ''}
          {s.perSheet ? ` · ${s.perSheet} per ${s.sheet}` : ''}
          {s.sheets ? ` · ${s.sheets} sheets` : ''}
          {order.recipe?.printer?.name ? ` · set for “${order.recipe.printer.name}”` : ''}
        </p>
        <p className="hint">Sent {formatWhen(order.createdAt)}{order.assignedName ? ` · ${order.assignedName} is on it` : ''}</p>
        {order.notes && <p className="customer-notes">“{order.notes}”</p>}
      </div>

      <div className="card">
        <div className="field-label">{order.customerName}</div>
        <div className="contact-row">
          <a className="ghost-btn" href={`tel:${order.customerPhone}`}>Call {order.customerPhone}</a>
          <a className="ghost-btn" href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${order.customerName}, about your order ${order.code}: `)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>

      <div className="card">
        <div className="field-label">Files</div>
        <ul className="file-rows">
          {order.files.map((f) => (
            <li key={f.id} className="file-row">
              <span>
                <strong>{f.kind === 'original' ? 'Customer file' : f.kind === 'imposed' ? 'Print-ready' : 'Fixed by operator'}</strong>
                <span className="hint"> · {f.name} · {sizeText(f.size)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}</span>
              </span>
              <button type="button" className="ghost-btn" disabled={!!busy} onClick={() => act('dl', async () => downloadBytes(await (await fetchFile(f)).arrayBuffer(), f.name, f.mime))}>
                Download
              </button>
            </li>
          ))}
        </ul>
        {canOpen && (
          <button
            type="button"
            className="primary spaced-top"
            disabled={!!busy}
            onClick={() => act('open', async () => onOpenInTool(order, await fetchFile(original), original.name))}
          >
            {busy === 'open' ? 'Opening…' : `Open in ${ORDER_TOOLS[order.recipe?.tool || order.tool]} with the customer’s settings`}
          </button>
        )}
        <div className="contact-row spaced-top">
          {[['operator', 'Add fixed file'], ['imposed', 'Add print-ready PDF']].map(([kind, label]) => (
            <label key={kind} className="ghost-btn file-pick">
              {busy === `upload-${kind}` ? 'Uploading…' : label}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const file = e.target.files[0];
                  e.target.value = '';
                  if (!file) return;
                  const f = new FormData();
                  f.append('kind', kind);
                  f.append('file', file, file.name);
                  act(`upload-${kind}`, () => api(`/orders/${id}/files`, { method: 'POST', auth: true, form: f }));
                }}
              />
            </label>
          ))}
        </div>
      </div>

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
            <button key={st} type="button" className={`chip ${order.status === st ? 'chip-on' : ''}`} disabled={!!busy || order.status === st} onClick={() => changeStatus(st)}>
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
              {(e.data.message || e.data.text) && <span className="timeline-msg">{e.data.message || e.data.text}</span>}
            </li>
          ))}
        </ol>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
