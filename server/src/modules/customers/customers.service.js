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

export async function listCustomers({ q = '', limit = 50 } = {}) {
  const like = `%${String(q).trim()}%`;
  return all(
    `SELECT c.id, c.name, c.phone, c.created_at AS "createdAt",
            count(o.id)::int AS orders, max(o.created_at) AS "lastOrderAt"
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      WHERE $1 = '%%' OR c.name ILIKE $1 OR c.phone ILIKE $1
      GROUP BY c.id
      ORDER BY max(o.created_at) DESC NULLS LAST
      LIMIT $2`,
    [like, Math.min(200, Number(limit) || 50)]
  );
}

export async function getCustomer(id) {
  const c = await get('SELECT id, name, phone, created_at AS "createdAt" FROM customers WHERE id = $1', [id]);
  if (!c) throw notFound('Customer not found.');
  const orders = await all(
    `SELECT id, code, tool, title, status, quantity, created_at AS "createdAt" FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  return { ...c, orders };
}
