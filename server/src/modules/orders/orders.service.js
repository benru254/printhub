// Orders: the customer sends a file + the settings they chose ("recipe"); the operator
// checks it, changes status, writes notes and messages. Every change is an order_event.
import { all, get, transaction } from '../../db.js';
import { ORDER_STATUSES } from '../../schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { makeOrderCode, cleanOrderCode } from '../../lib/codes.js';
import { normalizePhone } from '../../lib/phone.js';
import { cleanCustomerInput, findOrCreateCustomer } from '../customers/customers.service.js';
import { recordFile, listFiles } from '../files/files.service.js';

// What the customer sees for each status (tracking page).
export const STATUS_TEXT = {
  new: 'Received — waiting for the operator',
  checking: 'The operator is checking your file',
  needs_customer: 'We need something from you — see the message',
  approved: 'Approved — waiting to print',
  printing: 'Printing',
  ready: 'Ready to collect',
  collected: 'Collected — thank you!',
  cancelled: 'Cancelled',
};

const MAX_JSON = 200 * 1024;

function parseJson(value, label) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return value;
  if (String(value).length > MAX_JSON) throw badRequest(`${label} is too big.`);
  try {
    const v = JSON.parse(value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw badRequest(`${label} is not valid.`);
  }
}

function cleanOrderInput(body) {
  const tool = String(body.tool || '').trim();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(tool)) throw badRequest('Unknown tool.');
  const quantity = Math.floor(Number(body.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000000) throw badRequest('Please enter how many you need.');
  return {
    tool,
    title: String(body.title || '').trim().slice(0, 120),
    quantity,
    notes: String(body.notes || '').trim().slice(0, 2000),
    recipe: parseJson(body.recipe, 'The settings'),
    summary: parseJson(body.summary, 'The summary'),
  };
}

// Public: a customer sends an order. `file` = accepted upload (files.service acceptUpload).
export async function createOrder(body, file) {
  const who = cleanCustomerInput(body);
  const input = cleanOrderInput(body);
  return transaction(async (tx) => {
    const customer = await findOrCreateCustomer(tx, who);
    let order = null;
    for (let tries = 0; !order && tries < 8; tries++) {
      order = await tx.get(
        `INSERT INTO orders (code, customer_id, tool, title, recipe, summary, quantity, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code) DO NOTHING RETURNING *`,
        [makeOrderCode(), customer.id, input.tool, input.title, input.recipe, input.summary, input.quantity, input.notes]
      );
    }
    if (!order) throw new Error('Could not make a unique order code.');
    await recordFile(tx, order.id, 'original', file);
    await tx.run(`INSERT INTO order_events (order_id, kind, data, public) VALUES ($1, 'created', $2, TRUE)`, [order.id, { status: 'new' }]);
    return { code: order.code, status: order.status, statusText: STATUS_TEXT[order.status] };
  });
}

// Public: tracking needs the code AND the phone number, so codes can't be guessed.
export async function trackOrder(code, phone) {
  const c = cleanOrderCode(code);
  const p = normalizePhone(phone);
  const order = c && p
    ? await get(
        `SELECT o.* FROM orders o JOIN customers cu ON cu.id = o.customer_id WHERE o.code = $1 AND cu.phone = $2`,
        [c, p]
      )
    : null;
  if (!order) throw notFound('No order found with that code and phone number.');
  const events = await all(
    `SELECT kind, data, created_at AS "at" FROM order_events WHERE order_id = $1 AND public ORDER BY created_at`,
    [order.id]
  );
  return {
    code: order.code,
    title: order.title,
    tool: order.tool,
    quantity: order.quantity,
    status: order.status,
    statusText: STATUS_TEXT[order.status],
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    events: events.map((e) => ({
      at: e.at,
      kind: e.kind,
      status: e.data.status || null,
      statusText: e.data.status ? STATUS_TEXT[e.data.status] : null,
      message: e.data.message || null,
    })),
  };
}

const LIST_SQL = `
  SELECT o.id, o.code, o.tool, o.title, o.quantity, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
         o.summary, cu.id AS "customerId", cu.name AS "customerName", cu.phone AS "customerPhone",
         s.id AS "assignedId", s.name AS "assignedName"
    FROM orders o
    JOIN customers cu ON cu.id = o.customer_id
    LEFT JOIN staff s ON s.id = o.assigned_staff_id`;

// Staff: list orders. status = one status, 'open' (not collected/cancelled) or 'all'.
export async function listOrders({ status = 'open', q = '', limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (status === 'open') where.push(`o.status NOT IN ('collected', 'cancelled')`);
  else if (ORDER_STATUSES.includes(status)) {
    params.push(status);
    where.push(`o.status = $${params.length}`);
  }
  const text = String(q || '').trim();
  if (text) {
    params.push(`%${text}%`);
    where.push(`(o.code ILIKE $${params.length} OR o.title ILIKE $${params.length} OR cu.name ILIKE $${params.length} OR cu.phone ILIKE $${params.length})`);
  }
  params.push(Math.min(500, Number(limit) || 100));
  const rows = await all(
    `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.created_at DESC LIMIT $${params.length}`,
    params
  );
  const counts = await all(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`);
  return { orders: rows, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) };
}

export async function getOrder(id) {
  const order = await get(`${LIST_SQL} WHERE o.id = $1`, [id]);
  if (!order) throw notFound('Order not found.');
  const full = await get('SELECT recipe, notes FROM orders WHERE id = $1', [id]);
  const events = await all(
    `SELECT e.id, e.kind, e.data, e.public, e.created_at AS "at", s.name AS "staffName"
       FROM order_events e LEFT JOIN staff s ON s.id = e.staff_id
      WHERE e.order_id = $1 ORDER BY e.created_at, e.id`,
    [id]
  );
  return { ...order, recipe: full.recipe, notes: full.notes, statusText: STATUS_TEXT[order.status], files: await listFiles(id), events };
}

// Staff: change status / assignment / title / quantity.
// patch.message (optional): text the customer sees with a status change.
export async function updateOrder(staffId, id, patch = {}) {
  return transaction(async (tx) => {
    const o = await tx.get('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw notFound('Order not found.');
    const sets = [];
    const params = [];
    const set = (col, v) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    const events = [];
    const message = String(patch.message || '').trim().slice(0, 1000);

    if (patch.status !== undefined && patch.status !== o.status) {
      if (!ORDER_STATUSES.includes(patch.status)) throw badRequest('Unknown status.');
      if (patch.status === 'needs_customer' && !message) throw badRequest('Tell the customer what you need from them.');
      set('status', patch.status);
      events.push({ kind: 'status', data: { from: o.status, status: patch.status, ...(message ? { message } : {}) }, public: true });
    } else if (message) {
      events.push({ kind: 'message', data: { message }, public: true });
    }
    if (patch.assignedStaffId !== undefined) {
      const sid = patch.assignedStaffId === null ? null : Number(patch.assignedStaffId);
      if (sid !== null && !(await tx.get('SELECT 1 FROM staff WHERE id = $1 AND active', [sid]))) throw badRequest('That staff member is not active.');
      if (sid !== o.assigned_staff_id) {
        set('assigned_staff_id', sid);
        events.push({ kind: 'assigned', data: { from: o.assigned_staff_id, to: sid }, public: false });
      }
    }
    if (patch.title !== undefined && String(patch.title).trim() !== o.title) {
      const title = String(patch.title).trim().slice(0, 120);
      set('title', title);
      events.push({ kind: 'edited', data: { field: 'title', from: o.title, to: title }, public: false });
    }
    if (patch.quantity !== undefined && Number(patch.quantity) !== o.quantity) {
      const q = Math.floor(Number(patch.quantity));
      if (!Number.isFinite(q) || q < 1) throw badRequest('Quantity must be 1 or more.');
      set('quantity', q);
      events.push({ kind: 'edited', data: { field: 'quantity', from: o.quantity, to: q }, public: true, message: `Quantity changed to ${q}` });
    }
    if (patch.recipe !== undefined) {
      set('recipe', parseJson(patch.recipe, 'The settings'));
      events.push({ kind: 'edited', data: { field: 'recipe' }, public: false });
    }

    if (sets.length) {
      params.push(id);
      await tx.run(`UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    } else if (events.length) {
      await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [id]);
    }
    for (const e of events) {
      const data = e.message ? { ...e.data, message: e.message } : e.data;
      await tx.run('INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, $3, $4, $5)', [id, staffId, e.kind, data, e.public]);
    }
  }).then(() => getOrder(id));
}

// Staff: a note only staff can see.
export async function addNote(staffId, id, text) {
  const t = String(text || '').trim().slice(0, 2000);
  if (!t) throw badRequest('The note is empty.');
  if (!(await get('SELECT 1 FROM orders WHERE id = $1', [id]))) throw notFound('Order not found.');
  await transaction(async (tx) => {
    await tx.run(`INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'note', $3, FALSE)`, [id, staffId, { text: t }]);
    await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [id]);
  });
  return getOrder(id);
}

// Staff: an extra file (the fixed or imposed PDF).
export async function addFile(staffId, id, kind, info) {
  if (!(await get('SELECT 1 FROM orders WHERE id = $1', [id]))) throw notFound('Order not found.');
  await transaction(async (tx) => {
    const f = await recordFile(tx, id, kind, info, staffId);
    await tx.run(`INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'file', $3, FALSE)`, [id, staffId, { fileId: f.id, kind, name: f.name }]);
    await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [id]);
  });
  return getOrder(id);
}
