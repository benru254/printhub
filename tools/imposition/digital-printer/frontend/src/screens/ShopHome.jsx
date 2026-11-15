import { useMemo, useState } from 'react';
import { activeProducts, pricingContext, fromPrice, formatMoney, PRODUCT_GROUPS, readyDate } from '@engine';
import { staffToken } from '../lib/api.js';
import { customer, trackHref } from '../lib/customer.js';
import { waLink } from '../lib/whatsapp.js';
import { dayText } from '../lib/days.js';
import { useMyOrders } from '../hooks/useMyOrders.js';
import ProductIcon from '../products/ProductIcon.jsx';
import ReorderDialog from '../components/ReorderDialog.jsx';
import { needsYou } from '../lib/orderNeeds.js';

// THE SHOP'S FRONT DOOR. A customer comes to buy "business cards", not to "impose a PDF",
// so the first screen is the products with their prices. Someone who has ordered before
// first sees what needs them (a proof to approve) and their usual orders to repeat in one tap.
export default function ShopHome({ shop, onProduct, onOwnFile }) {
  const counter = !!staffToken.get();
  const s = shop.shop;
  const ctx = useMemo(() => pricingContext(shop), [shop.priceList, shop.printers, shop.customSheets]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useMemo(() => activeProducts(shop.catalogue), [shop.catalogue]);
  const prices = useMemo(() => Object.fromEntries(products.map((p) => [p.id, fromPrice(p, ctx)])), [products, ctx]);
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [again, setAgain] = useState(null);
  const mine = useMyOrders();
  const orders = !counter && mine.data ? mine.data.orders : [];

  const active = orders.filter((o) => !['collected', 'cancelled'].includes(o.status)).slice(0, 3);
  // "Your usual": the last order of each different thing they bought.
  const usual = [];
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const k = `${o.productId || o.title}|${o.detail || ''}`;
    if (!usual.some((u) => u.k === k)) usual.push({ k, o });
    if (usual.length === 4) break;
  }

  const groups = PRODUCT_GROUPS.filter((g) => products.some((p) => p.group === g.id));
  const text = q.trim().toLowerCase();
  const shown = products
    .filter((p) => (group === 'all' || p.group === group) && (!text || `${p.name} ${p.blurb}`.toLowerCase().includes(text)))
    .sort((a, b) => (group === 'all' && !text ? Number(!!b.popular) - Number(!!a.popular) : 0));
  const name = !counter && (mine.data ? mine.data.customer.name : customer.get().name).split(' ')[0];

  return (
    <main className="start home">
      {counter && (
        <p className="note-warn">
          You are logged in as staff: choose a product to enter a <strong>counter order</strong> for a customer. <a className="as-link" href="#/staff">Back to the orders</a>
        </p>
      )}

      {active.length > 0 && (
        <section className="home-block">
          <h2 className="home-label">{name ? `${name}, your orders` : 'Your orders'}</h2>
          {active.map((o) => {
            const todo = needsYou(o);
            return (
              <a key={o.code} className={`card home-order ${todo ? 'home-order-todo' : ''}`} href={trackHref(o.code, o.key)}>
                <span className="order-row-top">
                  <strong>{o.title} · {Number(o.quantity).toLocaleString('en-KE')}</strong>
                  <span className={`status-pill small status-${o.status}`}>{o.statusText.split(' — ')[0]}</span>
                </span>
                <span className={todo ? 'todo-line' : 'order-row-sub'}>{todo ? `${todo} ›` : o.dueAt ? `Ready ${dayText(o.dueAt)} · tap to follow it` : 'Tap to follow it'}</span>
              </a>
            );
          })}
        </section>
      )}

      {usual.length > 0 && (
        <section className="home-block">
          <h2 className="home-label">Order again</h2>
          <div className="usual-row">
            {usual.map(({ k, o }) => (
              <button key={k} type="button" className="usual" onClick={() => setAgain(o)}>
                <strong>{o.title}</strong>
                <span>{Number(o.quantity).toLocaleString('en-KE')}{o.detail ? ` · ${o.detail.split(' · ').slice(0, 2).join(' · ')}` : ''}</span>
                <em>Order again ›</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <h1 className="start-title">What do you want to print?</h1>
      {products.length > 8 && (
        <input className="num wide-select" type="search" placeholder="Search: cards, banner, stickers…" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {groups.length > 1 && (
        <div className="group-row" role="tablist" aria-label="Kind of product">
          {[{ id: 'all', name: 'All' }, ...groups].map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={`group ${group === g.id ? 'group-on' : ''}`} onClick={() => setGroup(g.id)}>{g.name}</button>
          ))}
        </div>
      )}

      <div className="product-grid">
        {shown.map((p) => (
          <button key={p.id} type="button" className="product" onClick={() => onProduct(p.id)}>
            <ProductIcon id={p.icon} />
            <span className="product-name">{p.name}</span>
            <span className="product-blurb">{p.blurb}</span>
            <span className="product-from">{prices[p.id] > 0 ? <>from <strong>{formatMoney(prices[p.id], ctx.priceList.currency)}</strong></> : 'Ask for a price'}</span>
            <span className="product-days">ready {dayText(readyDate(new Date(), p.days, s.closedDays))}</span>
          </button>
        ))}
      </div>
      {!shown.length && <p className="hint empty-list">Nothing found. Try another word, or ask the shop on WhatsApp.</p>}
      {ctx.priceList.example && <p className="hint">Example prices. The shop sets the real ones.</p>}

      <button type="button" className="card own-file" onClick={onOwnFile}>
        <span>
          <strong>Print my own file</strong>
          <span className="hint">Something else, or you want to lay it out yourself: choose a PDF or picture and see it on the sheet.</span>
        </span>
        <span className="tool-go" aria-hidden>›</span>
      </button>

      {(s.address || s.hours) && (
        <p className="shop-where">{s.address}{s.address && s.hours ? ' · ' : ''}{s.hours}</p>
      )}
      <nav className="start-links">
        <a href="#/orders">My orders</a>
        <span aria-hidden>·</span>
        <a href="#/track">Track an order</a>
        {s.whatsapp && (
          <>
            <span aria-hidden>·</span>
            <a href={waLink(s.whatsapp)} target="_blank" rel="noreferrer">WhatsApp us</a>
          </>
        )}
        <span aria-hidden>·</span>
        <a href="#/staff">Staff</a>
      </nav>

      {again && <ReorderDialog order={again} access={{ key: again.key }} shop={shop} onClose={() => { setAgain(null); mine.reload(); }} />}
    </main>
  );
}
