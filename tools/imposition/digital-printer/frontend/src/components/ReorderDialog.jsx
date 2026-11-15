import { useMemo, useRef, useState } from 'react';
import { findProduct, priceLadder, priceProduct, pricingContext, formatMoney, cleanChoice } from '@engine';
import { api, staffToken } from '../lib/api.js';
import { accessBody, rememberOrder, trackHref } from '../lib/customer.js';
import QuantityPicker from '../products/QuantityPicker.jsx';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

// "Order again": the same job with the same design, at today's price. Two taps.
//   order = { code, title, quantity, productId, choice, detail }   access = { key } or { phone }
//   staffOrderId = set when the shop repeats it for the customer
export default function ReorderDialog({ order, access, shop, staffOrderId, onClose }) {
  const product = order.productId ? findProduct(shop.catalogue, order.productId) : null;
  const usable = product && product.active !== false && order.choice;
  const ctx = useMemo(() => pricingContext(shop), [shop.priceList, shop.printers, shop.customSheets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [quantity, setQuantity] = useState(order.quantity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const key = useRef(newKey());
  const choice = usable ? cleanChoice(product, { ...order.choice, quantity }) : null;
  const quote = usable ? priceProduct(product, choice, ctx, { artwork: 'upload' }) : null;
  const currency = ctx.priceList.currency || 'KES';

  async function go() {
    setBusy(true);
    setError('');
    try {
      const body = { quantity, clientKey: key.current };
      const r = staffOrderId
        ? await api(`/orders/${staffOrderId}/reorder`, { method: 'POST', auth: true, json: body })
        : await api(`/orders/track/${encodeURIComponent(order.code)}/reorder`, { method: 'POST', json: { ...accessBody(access), ...body } });
      if (!staffToken.get()) rememberOrder(r, order.title);
      setSent(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-back" role="dialog" aria-modal="true" aria-labelledby="re-title">
      <div className="dialog">
        {sent ? (
          <>
            <h2 id="re-title" className="dialog-title">Ordered again ✓</h2>
            <p className="order-code">{sent.code}</p>
            {sent.estimate && <p className="dialog-text">{formatMoney(sent.estimate.total, sent.estimate.currency)} · we use the same design as last time.</p>}
            <div className="dialog-actions">
              <a className="primary as-link" href={sent.id ? `#/staff/order/${sent.id}` : trackHref(sent.code, sent.key)} onClick={onClose}>{sent.id ? 'Open the new order' : 'Track and pay'}</a>
              <button type="button" className="ghost-btn wide-btn" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="re-title" className="dialog-title">Order again</h2>
            <p className="dialog-text">{order.title}{order.detail ? ` · ${order.detail}` : ''}. Same design as order {order.code}.</p>
            {usable ? (
              <>
                <div className="field-label spaced">How many {product.unit}?</div>
                <QuantityPicker product={product} ladder={priceLadder(product, choice, ctx)} value={quantity} onChange={setQuantity} currency={currency} />
              </>
            ) : (
              <p className="hint">Same quantity as before: {order.quantity}. The shop confirms today’s price.</p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={go} disabled={busy}>
                {busy ? 'Ordering…' : `Order ${Number(quantity).toLocaleString('en-KE')}${quote && quote.total ? ` · ${formatMoney(quote.total, currency)}` : ''}`}
              </button>
              <button type="button" className="ghost-btn wide-btn" onClick={onClose} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
