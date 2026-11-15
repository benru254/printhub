import { useState } from 'react';
import { formatMoney } from '@engine';

// "How many?" as big buttons with the price on each one, because the first thing a
// customer asks is "how much for 100? and for 500?". Any other amount can be typed.
//   ladder = [{ quantity, total, each, saves, onRequest }] from priceLadder()
export default function QuantityPicker({ product, ladder, value, onChange, currency }) {
  const listed = ladder.some((r) => r.quantity === value);
  const [other, setOther] = useState(!listed);

  return (
    <div>
      <div className="qty-grid" role="radiogroup" aria-label="How many">
        {ladder.map((r) => {
          const on = !other && r.quantity === value;
          return (
            <button
              key={r.quantity}
              type="button"
              role="radio"
              aria-checked={on}
              className={`qty ${on ? 'qty-on' : ''}`}
              onClick={() => {
                setOther(false);
                onChange(r.quantity);
              }}
            >
              <span className="qty-n">{r.quantity.toLocaleString('en-KE')}</span>
              <span className="qty-price">{r.onRequest ? 'Ask the shop' : formatMoney(r.total, currency)}</span>
              {r.saves > 0 ? <span className="qty-save">Save {r.saves}%</span> : r.quantity > 1 && !r.onRequest ? <span className="qty-each">{formatMoney(r.each, currency)} each</span> : <span className="qty-each">&nbsp;</span>}
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={other} className={`qty ${other ? 'qty-on' : ''}`} onClick={() => setOther(true)}>
          <span className="qty-n">Other</span>
          <span className="qty-each">type how many</span>
        </button>
      </div>
      {other && (
        <label className="other-qty">
          <span className="hint">How many {product.unit}?</span>
          <input
            className="num num-big"
            type="number"
            inputMode="numeric"
            min="1"
            autoFocus
            value={value}
            onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          />
        </label>
      )}
    </div>
  );
}
