// Orders. Two ways an order is made:
//   from a PRODUCT  ("500 business cards"): the server works out the price, the tool, the
//                   operator's settings and the ready date from the shop's catalogue
//   from a TOOL     (the customer laid out their own file): the tool sends its settings ("recipe")
// Then the operator checks it, sends a proof, the customer approves, it is printed and collected.
// Every change is an order_event. The customer follows it all on the tracking page.
import crypto from 'node:crypto';
import { all, get, transaction } from '../../db.js';
import { ORDER_STATUSES } from '../../schema.js';
import { badRequest, notFound, HttpError } from '../../lib/errors.js';
import { makeOrderCode, cleanOrderCode } from '../../lib/codes.js';
import { normalizePhone } from '../../lib/phone.js';
import { signCustomerToken } from '../../middleware/auth.js';
import { cleanCustomerInput, findOrCreateCustomer } from '../customers/customers.service.js';
import { recordFile, listFiles, copyStoredFile, discardUpload } from '../files/files.service.js';
import { moneyFor, addEstimate, claimsFor, addClaim } from '../money/money.service.js';
import { shopData } from '../shop/shop.service.js';
import { quotePrice, formatMoney } from '../../../../tools/imposition/digital-printer/engine/core/pricing.js';
import { findProduct, cleanChoice } from '../../../../tools/imposition/digital-printer/engine/core/catalogue.js';
import { pricingContext, priceProduct, productRecipe, productSummary, depositFor } from '../../../../tools/imposition/digital-printer/engine/core/productPrice.js';
import { readyDate } from '../../../../tools/imposition/digital-printer/engine/core/workdays.js';

// What the customer sees for each status (tracking page).
export const STATUS_TEXT = {
  new: 'Received — waiting for the operator',
  checking: 'The operator is checking your order',
  needs_customer: 'We need something from you — see the message',
  proof: 'Your proof is ready — please check and approve it',
  approved: 'Approved — waiting to print',
  printing: 'Printing',
  ready: 'Ready to collect',
  collected: 'Collected — thank you!',
  cancelled: 'Cancelled',
};

const ARTWORK = ['upload', 'design', 'later'];
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

// The day the customer wants it: today or later, at most a year ahead. Anything else is ignored.
function cleanDue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  return d.getTime() < now - 86400000 || d.getTime() > now + 366 * 86400000 ? null : d;
}

// What every order has, whichever way it was made.
function cleanCommon(body) {
  const artwork = ARTWORK.includes(body.artwork) ? body.artwork : 'upload';
  const delivery = body.delivery === 'deliver' ? 'deliver' : 'collect';
  const address = String(body.address || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (delivery === 'deliver' && address.length < 3) throw badRequest('Tell us where to deliver it.');
  return {
    artwork,
    delivery,
    address: delivery === 'deliver' ? address : '',
    notes: String(body.notes || '').trim().slice(0, 2000),
    clientKey: /^[A-Za-z0-9-]{16,64}$/.test(String(body.clientKey || '')) ? String(body.clientKey) : null,
    dueAt: cleanDue(body.dueAt),
  };
}

// An order made in a tool: the tool's settings and what the job needs (sheets, cutting, binding).
function fromTool(body, data) {
  const tool = String(body.tool || '').trim();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(tool)) throw badRequest('Unknown tool.');
  const quantity = Math.floor(Number(body.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000000) throw badRequest('Please enter how many you need.');
  const priceSpec = parseJson(body.priceSpec, 'The price details');
  const priceOptions = parseJson(body.priceOptions, 'The price options');
  const quote = Array.isArray(priceSpec.groups)
    ? { ...quotePrice(priceSpec, priceOptions, data.priceList), options: priceOptions, spec: priceSpec }
    : null;
  return {
    tool, quantity, quote, productId: null, days: null,
    title: String(body.title || '').trim().slice(0, 120),
    recipe: parseJson(body.recipe, 'The settings'),
    summary: parseJson(body.summary, 'The summary'),
  };
}

// An order for a catalogue product. The phone only says WHICH product and WHAT was chosen;
// the price, the tool and the operator's settings are worked out here.
function fromProduct(selection, common, data) {
  const product = findProduct(data.catalogue, String(selection.id || ''));
  if (!product || product.active === false) throw badRequest('That product is not available any more. Please choose again.');
  const choice = cleanChoice(product, selection.choice);
  const extras = {
    artwork: common.artwork,
    speed: selection.speed === 'express' ? 'express' : 'standard',
    delivery: data.priceList.delivery && data.priceList.delivery.enabled === false ? 'collect' : common.delivery,
  };
  const quote = priceProduct(product, choice, pricingContext(data), extras);
  return {
    tool: productRecipe(product, choice, quote).tool,
    quantity: choice.quantity,
    title: product.name,
    recipe: { ...productRecipe(product, choice, quote), speed: quote.speed },
    summary: productSummary(product, choice, quote, data.priceList),
    quote: { ...quote, options: { paper: choice.paper || null, colour: choice.colour !== false, laminate: choice.laminate || 'none' } },
    productId: product.id,
    days: quote.days,
  };
}

const newTrackKey = () => crypto.randomBytes(12).toString('base64url');

async function insertOrder(tx, o) {
  let order = null;
  for (let tries = 0; !order && tries < 8; tries++) {
    order = await tx.get(
      `INSERT INTO orders (code, customer_id, tool, title, recipe, summary, quantity, notes, quote, client_key, due_at,
                           track_key, source, created_by_staff_id, product_id, artwork, delivery, address, reorder_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (code) DO NOTHING RETURNING *`,
      [makeOrderCode(), o.customerId, o.tool, o.title, o.recipe, o.summary, o.quantity, o.notes,
        o.quote ? JSON.stringify(o.quote) : null, o.clientKey, o.dueAt,
        newTrackKey(), o.source, o.staffId, o.productId, o.artwork, o.delivery, o.address, o.reorderOf || null]
    );
  }
  if (!order) throw new Error('Could not make a unique order code.');
  return order;
}

// What the phone gets back after sending (or repeating) an order.
function sentAnswer(order, data, { staff = null, replay = false } = {}) {
  const total = order.quote && order.quote.total ? order.quote.total : 0;
  return {
    code: order.code,
    key: order.track_key,
    status: order.status,
    statusText: STATUS_TEXT[order.status],
    dueAt: order.due_at,
    estimate: total ? { total, currency: order.quote.currency || 'KES', deposit: depositFor(total, data.shop.pay.depositPct, data.priceList) } : null,
    ...(staff ? { id: order.id } : { customerToken: signCustomerToken(order.customer_id) }),
    ...(replay ? { replay: true } : {}),
  };
}

// Public: a customer (or staff at the counter) sends an order.
//   file  = accepted upload (files.service acceptUpload), or null when there is no design yet
//   staff = set when a logged-in staff member typed the order in for a customer
// The price is worked out HERE from the shop's price list, never taken from the phone.
// Sending the same clientKey again (double tap, retry on bad network) returns the first order.
export async function createOrder(body, file, staff = null) {
  const who = cleanCustomerInput(body);
  const common = cleanCommon(body);
  if (common.artwork === 'upload' && !file) throw badRequest('Please add your design, or choose “I need a design”.');
  const selection = body.product ? parseJson(body.product, 'The product') : null;
  return transaction(async (tx) => {
    const data = await shopData(tx);
    if (common.clientKey) {
      const before = await tx.get('SELECT * FROM orders WHERE client_key = $1', [common.clientKey]);
      if (before) return sentAnswer(before, data, { staff, replay: true });
    }
    const made = selection ? fromProduct(selection, common, data) : fromTool(body, data);
    // Ready date: what the product needs, or later if the customer asked for later.
    const ready = made.days != null ? readyDate(new Date(), made.days, data.shop.closedDays) : null;
    const dueAt = ready && (!common.dueAt || common.dueAt < ready) ? ready : common.dueAt;
    const customer = await findOrCreateCustomer(tx, who);
    const order = await insertOrder(tx, {
      ...made, ...common, dueAt, customerId: customer.id,
      source: staff ? 'counter' : 'web', staffId: staff ? staff.id : null,
    });
    if (file) await recordFile(tx, order.id, common.artwork === 'upload' ? 'original' : 'reference', file, staff ? staff.id : null);
    if (made.quote) await addEstimate(tx, order.id, made.quote.total);
    await tx.run(`INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'created', $3, TRUE)`, [order.id, staff ? staff.id : null, { status: 'new', source: order.source }]);
    return sentAnswer(order, data, { staff });
  });
}

// ---------- the customer's side ----------

// A customer reaches an order with its code AND (their phone number OR the secret key in
// their tracking link), so codes can't be guessed.
async function findTracked(db, code, { phone, key } = {}) {
  const c = cleanOrderCode(code);
  const k = String(key || '');
  const p = normalizePhone(phone);
  let order = null;
  if (c && k.length >= 12) order = await db.get('SELECT * FROM orders WHERE code = $1 AND track_key = $2', [c, k]);
  if (!order && c && p) {
    order = await db.get('SELECT o.* FROM orders o JOIN customers cu ON cu.id = o.customer_id WHERE o.code = $1 AND cu.phone = $2', [c, p]);
  }
  if (!order) throw notFound('No order found with that code and phone number.');
  return order;
}

async function latestFile(db, orderId, kinds) {
  return db.get(
    `SELECT id, kind, original_name AS "name", mime, stored_name AS "storedName", created_at AS "createdAt"
       FROM order_files WHERE order_id = $1 AND kind = ANY($2::text[]) ORDER BY created_at DESC, id DESC LIMIT 1`,
    [orderId, `{${kinds.join(',')}}`]
  );
}

async function trackView(order, db = { all, get }) {
  const events = await db.all(
    `SELECT kind, data, created_at AS "at" FROM order_events WHERE order_id = $1 AND public ORDER BY created_at, id`,
    [order.id]
  );
  const data = await shopData(db);
  const money = await moneyFor(order.id, db, { withEntries: true });
  const proof = order.proof_state ? await latestFile(db, order.id, ['proof']) : null;
  const q = order.quote || {};
  const deposit = depositFor(money.total, data.shop.pay.depositPct, data.priceList);
  return {
    code: order.code,
    key: order.track_key,
    title: order.title,
    tool: order.tool,
    productId: order.product_id,
    choice: (order.recipe && order.recipe.product && order.recipe.product.choice) || null,
    quantity: order.quantity,
    detail: (order.summary && order.summary.detail) || '',
    status: order.status,
    statusText: STATUS_TEXT[order.status],
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    dueAt: order.due_at,
    artwork: order.artwork,
    delivery: order.delivery,
    address: order.address,
    currency: q.currency || 'KES',
    lines: [...(q.lines || []), ...(q.extras || [])].map((l) => ({ label: l.label, detail: l.detail, amount: l.amount })),
    discount: q.discount || 0,
    money: { total: money.total, paid: money.paid, balance: money.balance, depositDue: Math.max(0, Math.round((deposit - money.paid) * 100) / 100) },
    payments: money.entries.filter((e) => e.kind !== 'charge').map((e) => ({ at: e.at, kind: e.kind, amount: e.amount, method: e.method })),
    claims: (await claimsFor(order.id, db)).map((c) => ({ reference: c.reference, amount: c.amount, status: c.status, at: c.at })),
    proof: order.proof_state ? { state: order.proof_state, mime: proof ? proof.mime : null, name: proof ? proof.name : null, at: proof ? proof.createdAt : null } : null,
    canReorder: order.status !== 'cancelled',
    events: events.map((e) => ({
      at: e.at,
      kind: e.kind,
      action: e.data.action || null,
      status: e.data.status || null,
      statusText: e.data.status ? STATUS_TEXT[e.data.status] : null,
      message: e.data.message || null,
      amount: e.kind === 'price' ? e.data.to : e.data.amount ?? null,
    })),
  };
}

export async function trackOrder(code, access) {
  return trackView(await findTracked({ get }, code, access));
}

// The proof file itself, for the tracking page.
export async function trackProofFile(code, access) {
  const order = await findTracked({ get }, code, access);
  const f = order.proof_state ? await latestFile({ get }, order.id, ['proof']) : null;
  if (!f) throw notFound('There is no proof for this order yet.');
  return { orderId: order.id, fileId: f.id };
}

// The customer answers the proof: 'approve' (print it) or 'change' (with what to change).
export async function answerProof(code, access, { action, message }) {
  const text = String(message || '').trim().slice(0, 1000);
  if (action !== 'approve' && action !== 'change') throw badRequest('Choose Approve or Ask for a change.');
  if (action === 'change' && text.length < 3) throw badRequest('Tell us what to change.');
  const id = await transaction(async (tx) => {
    const found = await findTracked(tx, code, access);
    const o = await tx.get('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [found.id]);
    if (['collected', 'cancelled'].includes(o.status)) throw badRequest('This order is closed. Please contact the shop.');
    if (o.proof_state !== 'sent') throw badRequest(o.proof_state === 'approved' ? 'You have already approved this proof.' : 'There is no proof waiting for you.');
    const approved = action === 'approve';
    const status = approved ? 'approved' : 'checking';
    await tx.run('UPDATE orders SET proof_state = $1, status = $2, updated_at = now() WHERE id = $3', [approved ? 'approved' : 'changes', status, o.id]);
    await tx.run(
      `INSERT INTO order_events (order_id, kind, data, public) VALUES ($1, 'proof', $2, TRUE)`,
      [o.id, { action: approved ? 'approved' : 'changes', by: 'customer', from: o.status, status, ...(text ? { message: text } : {}) }]
    );
    return o.id;
  });
  return trackView(await get('SELECT * FROM orders WHERE id = $1', [id]));
}

// The customer sends their design after ordering ("I'll send it later"), or one more file.
export async function addCustomerFile(code, access, file) {
  const id = await transaction(async (tx) => {
    const found = await findTracked(tx, code, access);
    const o = await tx.get('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [found.id]);
    if (['collected', 'cancelled'].includes(o.status)) throw badRequest('This order is closed. Please make a new order.');
    const { n } = await tx.get(`SELECT count(*)::int AS n FROM order_files WHERE order_id = $1 AND uploaded_by_staff_id IS NULL`, [o.id]);
    if (n >= 12) throw badRequest('This order already has many files. Send the rest on WhatsApp.');
    const isDesign = o.artwork === 'later' || (o.artwork === 'upload' && n === 0);
    const f = await recordFile(tx, o.id, isDesign ? 'original' : 'reference', file);
    if (isDesign) await tx.run(`UPDATE orders SET artwork = 'upload', updated_at = now() WHERE id = $1`, [o.id]);
    else await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [o.id]);
    // If the shop was waiting for this, the order goes back to the operator.
    const status = o.status === 'needs_customer' ? 'checking' : o.status;
    if (status !== o.status) await tx.run('UPDATE orders SET status = $1 WHERE id = $2', [status, o.id]);
    await tx.run(
      `INSERT INTO order_events (order_id, kind, data, public) VALUES ($1, 'file', $2, TRUE)`,
      [o.id, { fileId: f.id, kind: f.kind, name: f.name, by: 'customer', ...(status !== o.status ? { status } : {}), message: isDesign ? 'Design received' : 'File received' }]
    );
    return o.id;
  });
  return trackView(await get('SELECT * FROM orders WHERE id = $1', [id]));
}

// "I have paid": the customer gives the M-Pesa code (or pastes the message). Staff confirm it.
export async function claimPayment(code, access, body = {}) {
  const id = await transaction(async (tx) => {
    const found = await findTracked(tx, code, access);
    const o = await tx.get('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [found.id]);
    if (o.status === 'cancelled') throw badRequest('This order was cancelled. Please contact the shop.');
    await addClaim(tx, o.id, { text: body.text, amount: body.amount });
    return o.id;
  });
  return trackView(await get('SELECT * FROM orders WHERE id = $1', [id]));
}

// "Order again": the same job at today's prices, with the design the shop last printed from.
export async function reorder(code, access, { quantity, clientKey } = {}, staff = null) {
  const source = await findTracked({ get }, code, access);
  if (source.status === 'cancelled') throw badRequest('A cancelled order cannot be repeated. Please make a new order.');
  // The fixed design if the shop made one, else what the customer sent.
  const design = (await latestFile({ get }, source.id, ['operator'])) || (await latestFile({ get }, source.id, ['original']));
  const copy = design ? await copyStoredFile(design) : null;
  const key = /^[A-Za-z0-9-]{16,64}$/.test(String(clientKey || '')) ? String(clientKey) : null;
  try {
    return await transaction(async (tx) => {
      const data = await shopData(tx);
      if (key) {
        const before = await tx.get('SELECT * FROM orders WHERE client_key = $1', [key]);
        if (before) {
          await discardUpload(copy ? { path: copy.fullPath } : null);
          return sentAnswer(before, data, { staff, replay: true });
        }
      }
      const common = {
        artwork: copy ? 'upload' : source.artwork, // a finished design is never charged twice
        delivery: source.delivery, address: source.address, notes: '', clientKey: key, dueAt: null,
      };
      let made;
      const old = source.recipe && source.recipe.product;
      if (source.product_id && old) {
        const product = findProduct(data.catalogue, source.product_id);
        if (!product || product.active === false) throw badRequest('The shop no longer offers this product. Please choose a new one.');
        const q = Math.floor(Number(quantity));
        const choice = { ...old.choice, quantity: q >= 1 ? q : old.choice.quantity };
        // Numbered books carry on where the last ones stopped.
        if (product.kind === 'pad' && source.summary && source.summary.numberTo) choice.numberFrom = source.summary.numberTo + 1;
        made = fromProduct({ id: product.id, choice }, common, data);
      } else {
        const spec = source.quote && source.quote.spec;
        const options = (source.quote && source.quote.options) || {};
        made = {
          tool: source.tool, quantity: source.quantity, title: source.title, recipe: source.recipe, summary: source.summary, productId: null, days: data.shop.turnaroundDays,
          quote: spec && Array.isArray(spec.groups) ? { ...quotePrice(spec, options, data.priceList), options, spec } : null,
        };
      }
      const order = await insertOrder(tx, {
        ...made, ...common, customerId: source.customer_id, reorderOf: source.id,
        dueAt: readyDate(new Date(), made.days ?? data.shop.turnaroundDays, data.shop.closedDays),
        recipe: { ...made.recipe, reorderOf: source.code },
        source: 'reorder', staffId: staff ? staff.id : null,
      });
      if (copy) await recordFile(tx, order.id, 'original', copy, staff ? staff.id : null);
      if (made.quote) await addEstimate(tx, order.id, made.quote.total);
      await tx.run(
        `INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'created', $3, TRUE)`,
        [order.id, staff ? staff.id : null, { status: 'new', source: 'reorder', message: `Same as order ${source.code}` }]
      );
      return sentAnswer(order, data, { staff });
    });
  } catch (e) {
    await discardUpload(copy ? { path: copy.fullPath } : null);
    throw e;
  }
}

// "My orders": everything this customer has ordered, newest first.
export async function customerOrders(customerId) {
  const customer = await get('SELECT id, name, phone FROM customers WHERE id = $1', [customerId]);
  if (!customer) throw notFound('Customer not found.');
  const rows = await all(
    `SELECT o.code, o.track_key AS "key", o.title, o.quantity, o.status, o.created_at AS "createdAt", o.due_at AS "dueAt",
            o.product_id AS "productId", o.proof_state AS "proofState", o.summary->>'detail' AS detail,
            o.artwork, o.recipe->'product'->'choice' AS choice,
            (SELECT coalesce(sum(amount_cents), 0) FROM order_ledger l WHERE l.order_id = o.id AND l.kind = 'charge')::float8 / 100 AS "total",
            (SELECT coalesce(sum(CASE kind WHEN 'payment' THEN amount_cents WHEN 'refund' THEN -amount_cents ELSE 0 END), 0)
               FROM order_ledger l WHERE l.order_id = o.id)::float8 / 100 AS "paid"
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 60`,
    [customerId]
  );
  return { customer: { name: customer.name, phone: customer.phone }, orders: rows.map((o) => ({ ...o, statusText: STATUS_TEXT[o.status] })) };
}

// A new phone: the customer proves who they are with their phone number and any of their order codes.
export async function customerLogin({ phone, code }) {
  const order = await findTracked({ get }, code, { phone });
  return { customerToken: signCustomerToken(order.customer_id), ...(await customerOrders(order.customer_id)) };
}

// ---------- the staff side ----------

const LIST_SQL = `
  SELECT o.id, o.code, o.tool, o.title, o.quantity, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
         o.summary, o.quote, o.due_at AS "dueAt", o.source, o.artwork, o.delivery, o.address,
         o.product_id AS "productId", o.proof_state AS "proofState", o.reorder_of AS "reorderOf", o.track_key AS "trackKey",
         cu.id AS "customerId", cu.name AS "customerName", cu.phone AS "customerPhone",
         s.id AS "assignedId", s.name AS "assignedName",
         (SELECT coalesce(sum(amount_cents), 0) FROM order_ledger l WHERE l.order_id = o.id AND l.kind = 'charge')::float8 / 100 AS "total",
         (SELECT coalesce(sum(CASE kind WHEN 'payment' THEN amount_cents WHEN 'refund' THEN -amount_cents ELSE 0 END), 0)
            FROM order_ledger l WHERE l.order_id = o.id)::float8 / 100 AS "paid",
         (SELECT count(*)::int FROM payment_claims pc WHERE pc.order_id = o.id AND pc.status = 'pending') AS "claims"
    FROM orders o
    JOIN customers cu ON cu.id = o.customer_id
    LEFT JOIN staff s ON s.id = o.assigned_staff_id`;

// Staff: list orders. status = one status, 'open' (not collected/cancelled) or 'all'.
// Open orders come soonest-needed first, so the top of the list is what to do next.
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
  const order = status === 'open' ? 'o.due_at ASC NULLS LAST, o.created_at ASC' : 'o.created_at DESC';
  const rows = await all(
    `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT $${params.length}`,
    params
  );
  const counts = await all(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`);
  return { orders: rows, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) };
}

export async function getOrder(id) {
  const order = await get(`${LIST_SQL} WHERE o.id = $1`, [id]);
  if (!order) throw notFound('Order not found.');
  const full = await get('SELECT o.recipe, o.notes, o.track_key, r.code AS "reorderCode" FROM orders o LEFT JOIN orders r ON r.id = o.reorder_of WHERE o.id = $1', [id]);
  const events = await all(
    `SELECT e.id, e.kind, e.data, e.public, e.created_at AS "at", s.name AS "staffName"
       FROM order_events e LEFT JOIN staff s ON s.id = e.staff_id
      WHERE e.order_id = $1 ORDER BY e.created_at, e.id`,
    [id]
  );
  const data = await shopData();
  const money = await moneyFor(id);
  const deposit = depositFor(money.total, data.shop.pay.depositPct, data.priceList);
  return {
    ...order, recipe: full.recipe, notes: full.notes, trackKey: full.track_key, reorderCode: full.reorderCode, statusText: STATUS_TEXT[order.status],
    files: await listFiles(id), events, money: { ...money, depositDue: Math.max(0, Math.round((deposit - money.paid) * 100) / 100) },
    claimList: await claimsFor(id),
  };
}

// Staff: change status / assignment / title / quantity.
//   patch.message (optional): text the customer sees with a status change.
//   patch.allowOwing: hand over an order that is not fully paid (the customer still owes).
//   patch.approvedElsewhere: the customer approved the proof by phone or WhatsApp.
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
      // A proof is with the customer: don't print until they say yes (here, or another way).
      if (['approved', 'printing', 'ready'].includes(patch.status) && o.proof_state === 'sent') {
        if (!patch.approvedElsewhere) {
          throw new HttpError(409, 'The customer has not approved the proof yet.', { needs: 'approvedElsewhere' });
        }
        set('proof_state', 'approved');
        events.push({ kind: 'proof', data: { action: 'approved', by: 'staff', message: 'Approved by phone or WhatsApp' }, public: true });
      }
      // Handing over an order that is not paid: only on purpose.
      if (patch.status === 'collected') {
        const money = await moneyFor(id, tx, { withEntries: false });
        if (money.balance > 0 && !patch.allowOwing) {
          throw new HttpError(409, `${formatMoney(money.balance)} is still to pay. Record the payment first.`, { needs: 'allowOwing', balance: money.balance });
        }
        if (money.balance > 0) events.push({ kind: 'note', data: { text: `Handed over with ${formatMoney(money.balance)} still to pay` }, public: false });
      }
      if (patch.status === 'proof' && o.proof_state !== 'sent') set('proof_state', 'sent');
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
    if (patch.dueAt !== undefined) {
      const due = patch.dueAt ? new Date(patch.dueAt) : null;
      if (due && Number.isNaN(due.getTime())) throw badRequest('That date is not valid.');
      set('due_at', due);
      events.push({ kind: 'edited', data: { field: 'due date', to: due ? due.toISOString().slice(0, 10) : 'none' }, public: false });
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

// Staff: repeat an order for the customer (they called or walked in).
export async function reorderById(staff, id, body = {}) {
  const o = await get('SELECT code, track_key FROM orders WHERE id = $1', [id]);
  if (!o) throw notFound('Order not found.');
  return reorder(o.code, { key: o.track_key }, body, staff);
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

// Staff: an extra file. kind 'operator' = the fixed design, 'imposed' = print-ready,
// 'proof' = shown to the customer: the order then waits for the customer's answer.
export async function addFile(staffId, id, kind, info) {
  await transaction(async (tx) => {
    const o = await tx.get('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw notFound('Order not found.');
    const f = await recordFile(tx, id, kind, info, staffId);
    if (kind === 'proof') {
      if (['collected', 'cancelled'].includes(o.status)) throw badRequest('This order is closed.');
      await tx.run(`UPDATE orders SET status = 'proof', proof_state = 'sent', updated_at = now() WHERE id = $1`, [id]);
      await tx.run(
        `INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'proof', $3, TRUE)`,
        [id, staffId, { action: 'sent', fileId: f.id, name: f.name, from: o.status, status: 'proof' }]
      );
    } else {
      await tx.run(`INSERT INTO order_events (order_id, staff_id, kind, data, public) VALUES ($1, $2, 'file', $3, FALSE)`, [id, staffId, { fileId: f.id, kind, name: f.name }]);
      await tx.run('UPDATE orders SET updated_at = now() WHERE id = $1', [id]);
    }
  });
  return getOrder(id);
}
