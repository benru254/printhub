import { formatMoney } from '@engine';
import PayBox from '../components/PayBox.jsx';
import { trackHref, trackUrl } from '../lib/customer.js';
import { waLink } from '../lib/whatsapp.js';
import { dayText, unitText } from '../lib/days.js';

// After "Send order": the code, what happens next, how to pay. One clear next step.
//   sent = the server's answer { code, key, dueAt, estimate, id? }   counter = staff typed it in
export default function OrderDone({ sent, product, quantity, artwork, delivery, shop, counter, onHome }) {
  const s = shop.shop;
  const total = sent.estimate ? sent.estimate.total : 0;
  const currency = sent.estimate ? sent.estimate.currency : 'KES';
  const link = trackUrl(sent.code, sent.key);
  const steps = [
    artwork === 'design' ? 'We make your design from what you told us.' : artwork === 'later' ? 'You send us your design (use the button below).' : 'We check your design.',
    'You get a picture (proof) to approve before anything is printed.',
    delivery === 'deliver' ? 'We print it and deliver it to you.' : `We print it. You collect${s.address ? ` at ${s.address}` : ' at the shop'}.`,
  ];

  return (
    <main className="start done">
      <div className="card done-card">
        <div className="done-tick" aria-hidden>✓</div>
        <h1 className="done-title">{counter ? 'Order saved' : 'Order sent'}</h1>
        <p className="order-code">{sent.code}</p>
        <p className="done-what">
          {product.name} · {quantity.toLocaleString('en-KE')} {unitText(product.unit, quantity)}
          {total > 0 && <> · <strong>{formatMoney(total, currency)}</strong></>}
        </p>
        {sent.dueAt && <p className="hint">Ready {dayText(sent.dueAt)}{total > 0 ? ' · the shop confirms the final price after checking your design' : ''}</p>}
        {!total && <p className="hint">The shop will send you the price.</p>}
      </div>

      {!counter && (
        <div className="card">
          <div className="field-label">What happens next</div>
          <ol className="next-steps">
            {steps.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        </div>
      )}

      {!counter && total > 0 && (
        <div className="card">
          <div className="field-label">Payment</div>
          <PayBox
            shop={s}
            code={sent.code}
            access={{ key: sent.key }}
            money={{ total, paid: 0, balance: total, depositDue: sent.estimate.deposit || 0 }}
            currency={currency}
            onOrder={() => { window.location.hash = trackHref(sent.code, sent.key); }}
          />
        </div>
      )}

      <div className="dialog-actions">
        {counter ? (
          <>
            <a className="primary as-link" href={`#/staff/order/${sent.id}`}>Open the order (payment, proof, ticket)</a>
            <button type="button" className="ghost-btn wide-btn" onClick={onHome}>Another counter order</button>
          </>
        ) : (
          <>
            <a className="primary as-link" href={trackHref(sent.code, sent.key)}>{artwork === 'later' ? 'Send my design / track my order' : 'Track my order'}</a>
            {s.whatsapp && (
              <a className="ghost-btn wide-btn as-btn-link" href={waLink(s.whatsapp, `Hello, I have sent order ${sent.code} (${product.name}, ${quantity}). `)} target="_blank" rel="noreferrer">
                Message {s.name} on WhatsApp
              </a>
            )}
            <a className="ghost-btn wide-btn as-btn-link" href={waLink('', `My print order ${sent.code}: ${link}`)} target="_blank" rel="noreferrer">
              Save the link in my WhatsApp
            </a>
            <button type="button" className="link-btn" onClick={onHome}>Order something else</button>
          </>
        )}
      </div>
    </main>
  );
}
