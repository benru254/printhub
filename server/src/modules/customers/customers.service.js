// Customers have no password: they are known by phone number and name.
// The same phone always means the same customer; the latest name they typed is kept.
import { all, get } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { normalizePhone } from '../../lib/phone.js';

export function cleanCustomerInput({ name, phone }) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (n.length < 2) throw badRequest('Please enter your name.');
  const p = normalizePhone(phone);
  if (!p) throw badRequest('Please enter a valid phone number, e.g. 0712 345 678.');
  return { name: n, phone: p };
}

// db = the transaction helper (or the plain db helpers).
export async function findOrCreateCustomer(db, { name, phone }) {
  return db.get(
    `INSERT INTO customers (name, phone) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING *`,
    [name, phone]
  );
}

const MONEY_SQL = `
  coalesce((SELECT sum(l.amount_cents) FROM order_ledger l JOIN orders o2 ON o2.id = l.order_id
             WHERE o2.customer_id = c.id AND o2.status <> 'cancelled' AND l.kind = 'charge'), 0)::float8 / 100 AS "billed",
  coalesce((SELECT sum(CASE l.kind WHEN 'payment' THEN l.amount_cents WHEN 'refund' THEN -l.amount_cents ELSE 0 END)
              FROM order_ledger l JOIN orders o2 ON o2.id = l.order_id WHERE o2.customer_id = c.id), 0)::float8 / 100 AS "paid"`;

// filter: 'all' | 'owing' (still to pay) | 'quiet' (2 or more orders, none in the last 45 days:
// the customers worth a "time to restock?" message).
export async function listCustomers({ q = '', limit = 100, filter = 'all' } = {}) {
  const like = `%${String(q).trim()}%`;
  const rows = await all(
    `SELECT c.id, c.name, c.phone, c.created_at AS "createdAt",
            count(o.id)::int AS orders, max(o.created_at) AS "lastOrderAt", ${MONEY_SQL}
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
      WHERE $1 = '%%' OR c.name ILIKE $1 OR c.phone ILIKE $1
      GROUP BY c.id
      ORDER BY max(o.created_at) DESC NULLS LAST
      LIMIT $2`,
    [like, Math.min(500, Number(limit) || 100)]
  );
  const quietBefore = Date.now() - 45 * 86400000;
  const list = rows.map((r) => ({
    ...r,
    owes: Math.max(0, Math.round((r.billed - r.paid) * 100) / 100),
    quiet: r.orders >= 2 && !!r.lastOrderAt && new Date(r.lastOrderAt).getTime() < quietBefore,
  }));
  if (filter === 'owing') return list.filter((c) => c.owes > 0);
  if (filter === 'quiet') return list.filter((c) => c.quiet);
  return list;
}

export async function getCustomer(id) {
  const c = await get(`SELECT c.id, c.name, c.phone, c.created_at AS "createdAt", ${MONEY_SQL} FROM customers c WHERE c.id = $1`, [id]);
  if (!c) throw notFound('Customer not found.');
  const orders = await all(
    `SELECT o.id, o.code, o.tool, o.title, o.status, o.quantity, o.created_at AS "createdAt", o.summary->>'detail' AS detail,
            (SELECT coalesce(sum(amount_cents), 0) FROM order_ledger l WHERE l.order_id = o.id AND l.kind = 'charge')::float8 / 100 AS "total",
            (SELECT coalesce(sum(CASE kind WHEN 'payment' THEN amount_cents WHEN 'refund' THEN -amount_cents ELSE 0 END), 0)
               FROM order_ledger l WHERE l.order_id = o.id)::float8 / 100 AS "paid"
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
    [id]
  );
  return { ...c, owes: Math.max(0, Math.round((c.billed - c.paid) * 100) / 100), orders };
}
