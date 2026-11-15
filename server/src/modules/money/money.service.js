// MONEY. The order_ledger table is the single source of truth: rows are added, never changed.
// Price, paid and balance are always worked out from the rows, so they can never drift apart.
// Amounts are kept in cents (whole numbers) so there are no rounding surprises.
import { all, get, transaction } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parseMpesa } from '../../../../tools/imposition/digital-printer/engine/core/mpesa.js';

export const PAYMENT_METHODS = ['cash', 'mpesa', 'bank', 'card', 'other'];

export const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => Number(cents) / 100;

function cleanAmount(amount, what = 'The amount') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw badRequest(`${what} must be more than 0.`);
  return toCents(n);
}

function totals(rows) {
  let total = 0;
  let paid = 0;
  for (const r of rows) {
    const c = Number(r.amount_cents);
    if (r.kind === 'charge') total += c;
    else if (r.kind === 'payment') paid += c;
    else if (r.kind === 'refund') paid -= c;
  }
  return { total: fromCents(total), paid: fromCents(paid), balance: fromCents(total - paid) };
}

// db = plain helpers or a transaction
export async function moneyFor(orderId, db = { all }, { withEntries = true } = {}) {
  const rows = await db.all(
    `SELECT l.id, l.kind, l.amount_cents, l.method, l.reference, l.note, l.created_at, s.name AS staff_name
       FROM order_ledger l LEFT JOIN staff s ON s.id = l.staff_id
      WHERE l.order_id = $1 ORDER BY l.created_at, l.id`,
    [orderId]
  );
  const t = totals(rows);
  if (!withEntries) return t;
  return {
    ...t,
    entries: rows.map((r) => ({
      id: r.id, kind: r.kind, amount: fromCents(r.amount_cents), method: r.method, reference: r.reference,
      note: r.note, at: r.created_at, staffName: r.staff_name,
    })),
  };
}

// First charge of an order: the estimate from the price list. Called inside createOrder's transaction.
export async function addEstimate(tx, orderId, total) {
  const cents = toCents(total);
  if (!(cents > 0)) return;
  await tx.run(`INSERT INTO order_ledger (order_id, kind, amount_cents, note) VALUES ($1, 'charge', $2, 'Estimate when the order was sent')`, [orderId, cents]);
}

async function lockOrder(tx, orderId) {
  const o = await tx.get('SELECT id, code FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!o) throw notFound('Order not found.');
  return o;
}

// Staff: set the final price. The ledger gets a charge for the difference (it can be negative).
export async function setPrice(staffId, orderId, { amount, note = '' }) {
  const target = Number(amount) === 0 ? 0 : cleanAmount(amount, 'The price');
  return transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const now = await moneyFor(orderId, tx, { withEntries: false });
    const delta = target - toCents(now.total);
    if (delta === 0) return;
    const text = String(note || '').trim().slice(0, 300);
    await tx.run(
      `INSERT INTO order_ledger (order_id, kind, amount_cents, note, staff_id) VALUES ($1, 'charge', $2, $3, $4)`,
      [orderId, delta, text || `Price set to ${fromCents(target)}`, staffId]
    );
    await tx.run(
      `INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'price', $3, TRUE)`,
      [orderId, staffId, { from: now.total, to: fromCents(target), ...(text ? { message: text } : {}) }]
    );
    await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [orderId]);
  });
}

// Staff: money received (kind 'payment') or given back (kind 'refund').
export async function addMoney(staffId, orderId, { kind = 'payment', amount, method = 'cash', reference = '', note = '' }) {
  if (kind !== 'payment' && kind !== 'refund') throw badRequest('Unknown entry.');
  const cents = cleanAmount(amount);
  if (!PAYMENT_METHODS.includes(method)) throw badRequest('Choose how it was paid.');
  const ref = String(reference || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
  if (method === 'mpesa' && kind === 'payment' && !/^[A-Z0-9]{8,12}$/.test(ref)) {
    throw badRequest('Enter the M-Pesa code from the message (e.g. TKA1B2C3D4).');
  }
  return transaction(async (tx) => {
    await lockOrder(tx, orderId);
    if (kind === 'refund') {
      const now = await moneyFor(orderId, tx, { withEntries: false });
      if (cents > toCents(now.paid)) throw badRequest('You cannot give back more than was paid.');
    }
    if (kind === 'payment' && ref) {
      const used = await tx.get(
        `SELECT o.code FROM order_ledger l JOIN orders o ON o.id = l.order_id WHERE l.kind = 'payment' AND l.method = $1 AND upper(l.reference) = $2`,
        [method, ref]
      );
      if (used) throw badRequest(`That code is already recorded on order ${used.code}.`);
    }
    await tx.run(
      `INSERT INTO order_ledger (order_id, kind, amount_cents, method, reference, note, staff_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, kind, cents, method, ref || null, String(note || '').trim().slice(0, 300), staffId]
    );
    await tx.run(
      `INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, $3, $4, TRUE)`,
      [orderId, staffId, kind, { amount: fromCents(cents), method }]
    );
    await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [orderId]);
  });
}

// ---------- "I have paid" ----------
// The customer tells us the M-Pesa code (or pastes the whole message). That is a CLAIM,
// not money: staff look at their own M-Pesa and confirm it, which adds the payment to the
// ledger, or reject it.

export async function claimsFor(orderId, db = { all }) {
  const rows = await db.all(
    `SELECT c.id, c.method, c.reference, c.amount_cents, c.status, c.note, c.created_at AS "at", c.decided_at AS "decidedAt", s.name AS "decidedBy"
       FROM payment_claims c LEFT JOIN staff s ON s.id = c.decided_by_staff_id
      WHERE c.order_id = $1 ORDER BY c.created_at, c.id`,
    [orderId]
  );
  return rows.map((r) => ({ ...r, amount: r.amount_cents == null ? null : fromCents(r.amount_cents), amount_cents: undefined }));
}

// tx = inside the caller's transaction (the order row is already locked).
export async function addClaim(tx, orderId, { text, amount }) {
  const read = parseMpesa(text);
  if (!read.code) throw badRequest('Paste the M-Pesa message, or type its code (e.g. TKA1B2C3D4).');
  const typed = Number(amount);
  const value = Number.isFinite(typed) && typed > 0 ? typed : read.amount;
  const paid = await tx.get(`SELECT 1 FROM order_ledger WHERE kind = 'payment' AND upper(reference) = $1`, [read.code]);
  if (paid) throw badRequest('That payment is already recorded. Thank you!');
  const claimed = await tx.get(`SELECT order_id FROM payment_claims WHERE upper(reference) = $1 AND status <> 'rejected'`, [read.code]);
  if (claimed) throw badRequest(claimed.order_id === orderId ? 'You have already sent us that code. The shop is checking it.' : 'That code has already been used for another order.');
  await tx.run(
    `INSERT INTO payment_claims (order_id, method, reference, amount_cents) VALUES ($1, 'mpesa', $2, $3)`,
    [orderId, read.code, value ? toCents(value) : null]
  );
  await tx.run(
    `INSERT INTO order_events (order_id, kind, data, public) VALUES ($1, 'claim', $2, TRUE)`,
    [orderId, { reference: read.code, ...(value ? { amount: value } : {}), message: 'You told us you paid. The shop is checking.' }]
  );
  await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [orderId]);
  return { reference: read.code, amount: value || null };
}

// Staff: 'confirm' (the money is really there: it goes into the ledger) or 'reject'.
export async function decideClaim(staffId, orderId, claimId, { action, amount, note = '' }) {
  if (action !== 'confirm' && action !== 'reject') throw badRequest('Choose Confirm or Not received.');
  const claim = await get('SELECT * FROM payment_claims WHERE id = $1 AND order_id = $2', [claimId, orderId]);
  if (!claim) throw notFound('That payment message was not found.');
  if (claim.status !== 'pending') throw badRequest('This one has already been dealt with.');
  if (action === 'confirm') {
    const value = Number(amount) > 0 ? Number(amount) : claim.amount_cents != null ? fromCents(claim.amount_cents) : null;
    if (!value) throw badRequest('Enter the amount that came in.');
    // The payment goes through the normal door, so every rule (no code twice) still holds.
    await addMoney(staffId, orderId, { kind: 'payment', amount: value, method: claim.method, reference: claim.reference, note: 'Confirmed from the customer’s message' });
  }
  await transaction(async (tx) => {
    await tx.run(
      `UPDATE payment_claims SET status = $1, decided_by_staff_id = $2, decided_at = now(), note = $3 WHERE id = $4`,
      [action === 'confirm' ? 'confirmed' : 'rejected', staffId, String(note || '').trim().slice(0, 300), claimId]
    );
    if (action === 'reject') {
      await tx.run(
        `INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'claim', $3, TRUE)`,
        [orderId, staffId, { reference: claim.reference, action: 'rejected', message: `We could not find payment ${claim.reference}. Please check the code or contact the shop.` }]
      );
      await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [orderId]);
    }
  });
}

// Staff: what came in today (or between two dates), by method. For closing the till.
export async function daySummary({ from, to } = {}) {
  const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = to ? new Date(to) : new Date(start.getTime() + 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badRequest('The dates are not valid.');
  const rows = await all(
    `SELECT kind, coalesce(method, '') AS method, sum(amount_cents)::bigint AS cents, count(*)::int AS n
       FROM order_ledger WHERE kind IN ('payment', 'refund') AND created_at >= $1 AND created_at < $2
      GROUP BY kind, method ORDER BY kind, method`,
    [start, end]
  );
  const owed = await get(
    `SELECT coalesce(sum(CASE kind WHEN 'charge' THEN amount_cents WHEN 'payment' THEN -amount_cents ELSE amount_cents END), 0)::bigint AS cents
       FROM order_ledger l JOIN orders o ON o.id = l.order_id WHERE o.status <> 'cancelled'`
  );
  const received = rows.filter((r) => r.kind === 'payment').reduce((a, r) => a + Number(r.cents), 0);
  const refunded = rows.filter((r) => r.kind === 'refund').reduce((a, r) => a + Number(r.cents), 0);
  return {
    from: start, to: end,
    received: fromCents(received), refunded: fromCents(refunded), net: fromCents(received - refunded),
    byMethod: rows.map((r) => ({ kind: r.kind, method: r.method, amount: fromCents(r.cents), count: r.n })),
    owedByCustomers: fromCents(owed.cents),
  };
}
