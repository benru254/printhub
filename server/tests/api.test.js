// API tests. Run: npm test
// With no TEST_DATABASE_URL they use the built-in database, in memory (nothing to set up).
// With TEST_DATABASE_URL=postgres://... they use that database: every run WIPES it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { config } = await import('../src/config.js');
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/schema.js');
const { createApp } = await import('../src/app.js');
const { normalizePhone } = await import('../src/lib/phone.js');
const { cleanOrderCode } = await import('../src/lib/codes.js');
const fs = await import('node:fs/promises');

let server;
let base;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function call(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (json) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(base + path, { method, headers, body });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), res };
}

function orderForm(fields = {}, file = PDF, name = 'cards.pdf') {
  const f = new FormData();
  const all = { name: 'Amina W', phone: '0712 345 678', tool: 'cards', title: 'Business cards', quantity: '200', notes: 'Matt please', recipe: JSON.stringify({ base: { sheet: 'SRA3' } }), summary: JSON.stringify({ perSheet: 21 }), ...fields };
  for (const [k, v] of Object.entries(all)) f.append(k, v);
  if (file) f.append('file', new Blob([file]), name);
  return f;
}

before(async () => {
  // Safety: never wipe the real shop database. (The built-in test database lives in memory only.)
  if (config.databaseUrl !== 'memory') {
    const { db } = (await pool.query('SELECT current_database() AS db')).rows[0];
    if (!/test/i.test(db) || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error(`Refusing to run tests on database "${db}". TEST_DATABASE_URL must point to a separate database with "test" in its name.`);
    }
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await fs.rm(config.uploadDir, { recursive: true, force: true });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await pool.end();
  await fs.rm(config.uploadDir, { recursive: true, force: true });
});

test('phone numbers are stored in one form', () => {
  assert.equal(normalizePhone('0712 345 678'), '+254712345678');
  assert.equal(normalizePhone('712345678'), '+254712345678');
  assert.equal(normalizePhone('254712345678'), '+254712345678');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone('12'), null);
  assert.equal(cleanOrderCode('ph 7k4qx2'), 'PH-7K4QX2');
});

let admin;
let operator;
let orderCode;
let orderId;

test('first admin: setup works once, then is closed', async () => {
  assert.equal((await call('GET', '/setup')).body.needed, true);
  const weak = await call('POST', '/setup', { json: { name: 'Reuben', username: 'reuben', password: 'short' } });
  assert.equal(weak.status, 400);
  const ok = await call('POST', '/setup', { json: { name: 'Reuben', username: 'Reuben', password: 'secret-pass-1' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.staff.role, 'admin');
  assert.equal(ok.body.staff.username, 'reuben');
  admin = ok.body.token;
  const again = await call('POST', '/setup', { json: { name: 'X', username: 'xx1', password: 'secret-pass-1' } });
  assert.equal(again.status, 403);
});

test('login, wrong password, me', async () => {
  assert.equal((await call('POST', '/auth/login', { json: { username: 'reuben', password: 'nope-nope' } })).status, 401);
  const ok = await call('POST', '/auth/login', { json: { username: 'REUBEN', password: 'secret-pass-1' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/auth/me', { token: ok.body.token })).body.staff.name, 'Reuben');
  assert.equal((await call('GET', '/auth/me')).status, 401);
});

test('admin adds an operator; operators cannot manage staff', async () => {
  const add = await call('POST', '/staff', { token: admin, json: { name: 'Kevin', username: 'kevin', password: 'kevin-pass-1' } });
  assert.equal(add.status, 201);
  assert.equal(add.body.staff.role, 'operator');
  operator = (await call('POST', '/auth/login', { json: { username: 'kevin', password: 'kevin-pass-1' } })).body.token;
  assert.equal((await call('GET', '/staff', { token: operator })).status, 403);
  const dup = await call('POST', '/staff', { token: admin, json: { name: 'K2', username: 'kevin', password: 'kevin-pass-1' } });
  assert.equal(dup.status, 400);
});

test('the last admin cannot be switched off', async () => {
  const me = (await call('GET', '/auth/me', { token: admin })).body.staff;
  const r = await call('PATCH', `/staff/${me.id}`, { token: admin, json: { active: false } });
  assert.equal(r.status, 400);
});

test('customer sends an order with a file (no password)', async () => {
  const r = await call('POST', '/orders', { form: orderForm() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.code, /^PH-[2-9A-Z]{6}$/);
  orderCode = r.body.code;
});

test('bad orders are refused and their files are not kept', async () => {
  assert.equal((await call('POST', '/orders', { form: orderForm({ phone: '12' }) })).status, 400);
  assert.equal((await call('POST', '/orders', { form: orderForm({}, null) })).status, 400);
  const exe = await call('POST', '/orders', { form: orderForm({}, Buffer.from('MZ not a pdf'), 'virus.pdf') });
  assert.equal(exe.status, 400);
  assert.match(exe.body.error, /PDF, PNG or JPG/);
  // Only the one good file is in the upload folder.
  const files = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(`${dir}/${e.name}`);
      else files.push(e.name);
    }
  }
  await walk(config.uploadDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /\.pdf$/);
});

test('tracking needs the code and the same phone', async () => {
  const ok = await call('GET', `/orders/track/${orderCode.toLowerCase()}?phone=${encodeURIComponent('+254712345678')}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.order.status, 'new');
  assert.equal(ok.body.order.events.length, 1);
  assert.equal((await call('GET', `/orders/track/${orderCode}?phone=0700000000`)).status, 404);
});

test('staff see the order with customer, recipe and file', async () => {
  assert.equal((await call('GET', '/orders')).status, 401);
  const list = await call('GET', '/orders', { token: operator });
  assert.equal(list.body.orders.length, 1);
  assert.equal(list.body.counts.new, 1);
  orderId = list.body.orders[0].id;
  const d = await call('GET', `/orders/${orderId}`, { token: operator });
  assert.equal(d.body.order.customerName, 'Amina W');
  assert.equal(d.body.order.customerPhone, '+254712345678');
  assert.equal(d.body.order.recipe.base.sheet, 'SRA3');
  assert.equal(d.body.order.files.length, 1);
  assert.equal(d.body.order.files[0].kind, 'original');
  const file = await call('GET', `/orders/${orderId}/files/${d.body.order.files[0].id}`, { token: operator });
  assert.equal(file.status, 200);
  assert.ok(file.body.equals(PDF));
});

test('status changes, messages and notes are recorded with who did them', async () => {
  const needs = await call('PATCH', `/orders/${orderId}`, { token: operator, json: { status: 'needs_customer' } });
  assert.equal(needs.status, 400); // must say what is needed
  const r = await call('PATCH', `/orders/${orderId}`, { token: operator, json: { status: 'needs_customer', message: 'Please send the logo in higher quality.' } });
  assert.equal(r.body.order.status, 'needs_customer');
  await call('POST', `/orders/${orderId}/notes`, { token: operator, json: { text: 'Customer called, sending tomorrow' } });
  const d = (await call('GET', `/orders/${orderId}`, { token: admin })).body.order;
  const status = d.events.find((e) => e.kind === 'status');
  assert.equal(status.staffName, 'Kevin');
  assert.equal(d.events.find((e) => e.kind === 'note').public, false);
  // The customer sees the message, not the staff note.
  const t = (await call('GET', `/orders/track/${orderCode}?phone=0712345678`)).body.order;
  assert.equal(t.status, 'needs_customer');
  assert.ok(t.events.some((e) => e.message === 'Please send the logo in higher quality.'));
  assert.ok(!JSON.stringify(t).includes('sending tomorrow'));
});

test('operator adds a fixed file', async () => {
  const f = new FormData();
  f.append('kind', 'operator');
  f.append('file', new Blob([PDF]), 'fixed.pdf');
  const r = await call('POST', `/orders/${orderId}/files`, { token: operator, form: f });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.files.length, 2);
  assert.ok(r.body.order.events.some((e) => e.kind === 'file'));
});

test('a deactivated account stops working at once', async () => {
  const staff = (await call('GET', '/staff', { token: admin })).body.staff;
  const kevin = staff.find((s) => s.username === 'kevin');
  await call('PATCH', `/staff/${kevin.id}`, { token: admin, json: { active: false } });
  assert.equal((await call('GET', '/orders', { token: operator })).status, 401);
});

// ---------- Part 9: shop settings, prices, money ledger ----------

const SPEC = { groups: [{ label: 'Printing', sheets: 5, sheetW: 320, sheetH: 450, sides: 1 }], cut: 'guillotine' };
let paidOrderId;
let paidCode;

test('shop: anyone reads it, only the admin changes it', async () => {
  const pub = await call('GET', '/shop');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.priceList.example, true);
  assert.equal((await call('PUT', '/shop', { json: { shop: { name: 'X' } } })).status, 401);
  const bad = await call('PUT', '/shop', { token: admin, json: { priceList: { papers: [] } } });
  assert.equal(bad.status, 400);
  const list = { ...pub.body.priceList, minOrder: 500, papers: pub.body.priceList.papers.map((p) => (p.id === 'card300' ? { ...p, priceA3: 40 } : p)) };
  const ok = await call('PUT', '/shop', { token: admin, json: { shop: { name: 'Dispatch Print', whatsapp: '0712 000 111', turnaroundDays: 1 }, priceList: list } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.shop.whatsapp, '+254712000111');
  assert.equal(ok.body.priceList.example, false);
  assert.equal(ok.body.priceList.minOrder, 500);
});

test('the server prices the order from its own price list', async () => {
  const key = 'test-key-0123456789abcdef';
  const form = () => orderForm({ phone: '0733 111 222', name: 'Brian O', priceSpec: JSON.stringify(SPEC), priceOptions: JSON.stringify({ paper: 'card300', colour: true, laminate: 'none', total: 1 }), clientKey: key });
  const r = await call('POST', '/orders', { form: form() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // 5 SRA3 sheets x (40 paper + 30 print) x 1.154 area = 404 + cutting 110 = 514 -> rounded up to 520
  assert.equal(r.body.estimate.total, 520);
  paidCode = r.body.code;
  // Same key again (double tap): same order, no second one.
  const again = await call('POST', '/orders', { form: form() });
  assert.equal(again.status, 200);
  assert.equal(again.body.code, paidCode);
  const list = await call('GET', '/orders?q=Brian', { token: admin });
  assert.equal(list.body.orders.length, 1);
  paidOrderId = list.body.orders[0].id;
  assert.equal(list.body.orders[0].total, 520);
  assert.equal(list.body.orders[0].paid, 0);
});

test('money is a ledger: price change, payments, refund, balance', async () => {
  const price = await call('PUT', `/orders/${paidOrderId}/price`, { token: admin, json: { amount: 600, note: 'Added matt lamination' } });
  assert.equal(price.body.order.money.total, 600);
  assert.equal(price.body.order.money.entries.length, 2); // estimate + the difference
  assert.equal(price.body.order.money.entries[1].amount, 80);

  const noCode = await call('POST', `/orders/${paidOrderId}/payments`, { token: admin, json: { amount: 300, method: 'mpesa' } });
  assert.equal(noCode.status, 400);
  const pay = await call('POST', `/orders/${paidOrderId}/payments`, { token: admin, json: { amount: 300, method: 'mpesa', reference: 'tka1b2c3d4' } });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  assert.equal(pay.body.order.money.paid, 300);
  assert.equal(pay.body.order.money.balance, 300);
  // The same M-Pesa code cannot be used twice.
  const dup = await call('POST', `/orders/${orderId}/payments`, { token: admin, json: { amount: 50, method: 'mpesa', reference: 'TKA1B2C3D4' } });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, new RegExp(paidCode));

  await call('POST', `/orders/${paidOrderId}/payments`, { token: admin, json: { amount: 300, method: 'cash' } });
  const tooMuch = await call('POST', `/orders/${paidOrderId}/payments`, { token: admin, json: { kind: 'refund', amount: 700, method: 'cash' } });
  assert.equal(tooMuch.status, 400);
  const refund = await call('POST', `/orders/${paidOrderId}/payments`, { token: admin, json: { kind: 'refund', amount: 100, method: 'cash' } });
  assert.equal(refund.body.order.money.paid, 500);
  assert.equal(refund.body.order.money.balance, 100);

  // The customer sees price, paid and balance, but not the ledger notes.
  const t = (await call('GET', `/orders/track/${paidCode}?phone=0733111222`)).body.order;
  assert.deepEqual(t.money, { total: 600, paid: 500, balance: 100, depositDue: 0 });
  assert.ok(t.events.some((e) => e.kind === 'payment' && e.amount === 300));

  const sum = (await call('GET', '/money/summary', { token: admin })).body.summary;
  assert.equal(sum.received, 600);
  assert.equal(sum.refunded, 100);
  assert.equal(sum.owedByCustomers, 100);
});

test('answers carry safety headers and are never cached', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
});

// ---------- Part 10: products, proofs, "I have paid", order again, counter orders ----------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not a real picture, only the right first bytes')]);
const CARDS = { id: 'business-cards', choice: { quantity: 100 } };

// A product order: who, which product, what was chosen. No price, no tool, no settings.
function productForm(product, fields = {}, file = PDF) {
  const f = new FormData();
  const all = { name: 'Wanjiru K', phone: '0722 555 666', product: JSON.stringify(product), ...fields };
  for (const [k, v] of Object.entries(all)) f.append(k, v);
  if (file) f.append('file', new Blob([file]), 'design.pdf');
  return f;
}

let cust; // { code, key, token, id }

test('shop: the catalogue is public, the admin edits it and the payment details', async () => {
  const pub = (await call('GET', '/shop')).body;
  assert.ok(pub.catalogue.products.length >= 10);
  assert.equal(pub.shop.pay.method, 'none');
  const bad = await call('PUT', '/shop', { token: admin, json: { catalogue: { products: [{ name: 'X', sizes: [] }] } } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /size/);
  assert.equal((await call('PUT', '/shop', { token: operator, json: { catalogue: pub.catalogue } })).status, 401); // Kevin was switched off
  const noNumber = await call('PUT', '/shop', { token: admin, json: { shop: { ...pub.shop, pay: { method: 'till', number: '12' } } } });
  assert.equal(noNumber.status, 400);
  // Hide one product, set the till number and a 50% deposit.
  const catalogue = { products: pub.catalogue.products.map((p) => (p.id === 'certificates' ? { ...p, active: false } : p)) };
  const ok = await call('PUT', '/shop', { token: admin, json: { catalogue, shop: { ...pub.shop, address: 'Kimathi St, Nairobi', pay: { method: 'till', number: '5 123 456', name: 'Dispatch Print', depositPct: 50 } } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.shop.pay.number, '5123456');
  assert.equal(ok.body.shop.name, 'Dispatch Print');
  assert.equal(ok.body.catalogue.products.find((p) => p.id === 'certificates').active, false);
});

test('a product order is priced, set up and dated by the server', async () => {
  // The phone tries to send its own price, tool and quantity: all ignored.
  const r = await call('POST', '/orders', { form: productForm(CARDS, { quantity: '1', tool: 'hack', title: 'Free cards', priceSpec: JSON.stringify(SPEC), notes: 'Call me first' }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // 100 cards = 5 A3 sheets x (40 card + 2 x 30 colour) = 500, cutting 110 -> 610. Deposit 50% -> 310.
  assert.deepEqual(r.body.estimate, { total: 610, currency: 'KES', deposit: 310 });
  assert.ok(r.body.key.length >= 16 && r.body.customerToken && r.body.id === undefined);
  const due = new Date(r.body.dueAt);
  assert.ok(due.getDay() !== 0 && due.getTime() > Date.now() - 1000, 'ready on a day the shop is open');
  cust = { code: r.body.code, key: r.body.key, token: r.body.customerToken };

  const o = (await call('GET', '/orders?q=Wanjiru', { token: admin })).body.orders[0];
  cust.id = o.id;
  assert.deepEqual([o.title, o.quantity, o.tool, o.productId, o.source, o.artwork, o.total], ['Business cards', 100, 'cards', 'business-cards', 'web', 'upload', 610]);
  assert.match(o.summary.detail, /90 × 55 mm · Art card 300 gsm · colour · both sides/);
  const full = (await call('GET', `/orders/${o.id}`, { token: admin })).body.order;
  assert.deepEqual(full.recipe.base.size, { w: 90, h: 55 });
  assert.equal(full.recipe.base.copies, 100);
  assert.equal(full.money.depositDue, 310);
  assert.equal(full.files[0].kind, 'original');
});

test('no design yet: the shop designs it (fee) or the customer sends it later', async () => {
  assert.equal((await call('POST', '/orders', { form: productForm(CARDS, {}, null) })).status, 400); // "upload" needs a file
  const design = await call('POST', '/orders', { form: productForm(CARDS, { artwork: 'design', notes: 'Blue, with my logo' }, null) });
  assert.equal(design.status, 201, JSON.stringify(design.body));
  assert.equal(design.body.estimate.total, 1110); // 610 + 500 design
  // A logo sent with a design request is kept as a reference, not as the design.
  const withLogo = await call('POST', '/orders', { form: productForm(CARDS, { artwork: 'design', phone: '0722 555 777', name: 'Logo Man' }, PNG) });
  const o = (await call('GET', '/orders?q=Logo', { token: admin })).body.orders[0];
  assert.equal((await call('GET', `/orders/${o.id}`, { token: admin })).body.order.files[0].kind, 'reference');
  assert.equal(withLogo.body.estimate.total, 1110);

  const later = await call('POST', '/orders', { form: productForm({ id: 'banners', choice: { size: '1x2' } }, { artwork: 'later', delivery: 'deliver', address: 'Moi Avenue, opposite the bank' }, null) });
  assert.equal(later.status, 201, JSON.stringify(later.body));
  assert.equal(later.body.estimate.total, 2020); // banner 1820 + delivery 200
  assert.equal((await call('POST', '/orders', { form: productForm(CARDS, { artwork: 'later', delivery: 'deliver' }, null) })).status, 400); // deliver where?
  // The customer sends the design afterwards: with the key from their link, no phone number needed.
  const f = new FormData();
  f.append('key', later.body.key);
  f.append('file', new Blob([PDF]), 'banner.pdf');
  const sent = await call('POST', `/orders/track/${later.body.code}/files`, { form: f });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.order.artwork, 'upload');
  assert.ok(sent.body.order.events.some((e) => e.kind === 'file' && e.message === 'Design received'));
  const noKey = new FormData();
  noKey.append('file', new Blob([PDF]), 'x.pdf');
  assert.equal((await call('POST', `/orders/track/${later.body.code}/files`, { form: noKey })).status, 404);
});

test('products that are hidden or unknown cannot be ordered; express costs extra', async () => {
  assert.equal((await call('POST', '/orders', { form: productForm({ id: 'certificates', choice: {} }) })).status, 400);
  assert.equal((await call('POST', '/orders', { form: productForm({ id: 'gold-bars', choice: {} }) })).status, 400);
  const std = await call('POST', '/orders', { form: productForm({ id: 'invitation-cards', choice: { quantity: 100 } }) });
  const exp = await call('POST', '/orders', { form: productForm({ id: 'invitation-cards', choice: { quantity: 100 }, speed: 'express' }) });
  assert.equal(std.status, 201);
  assert.ok(exp.body.estimate.total > std.body.estimate.total, 'express costs more');
  assert.ok(new Date(exp.body.dueAt) < new Date(std.body.dueAt), 'and is ready sooner');
});

test('the customer follows the order with the link key, and sees all their orders', async () => {
  const byKey = await call('GET', `/orders/track/${cust.code}?key=${cust.key}`);
  assert.equal(byKey.status, 200);
  assert.deepEqual(byKey.body.order.money, { total: 610, paid: 0, balance: 610, depositDue: 310 });
  assert.equal(byKey.body.order.lines.length, 2);
  assert.equal((await call('GET', `/orders/track/${cust.code}?key=${'x'.repeat(16)}`)).status, 404);
  assert.equal((await call('GET', `/orders/track/${cust.code}?phone=0722555666`)).status, 200);

  const mine = await call('GET', '/me/orders', { token: cust.token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.customer.name, 'Wanjiru K');
  assert.ok(mine.body.orders.length >= 3 && mine.body.orders.every((o) => o.key && o.statusText));
  // A customer's token is not a staff login, and a staff login is not a customer.
  assert.equal((await call('GET', '/orders', { token: cust.token })).status, 401);
  assert.equal((await call('GET', '/me/orders', { token: admin })).status, 401);
  assert.equal((await call('GET', '/me/orders')).status, 401);
  // A new phone: phone number + any order code.
  const login = await call('POST', '/me/login', { json: { phone: '0722 555 666', code: cust.code } });
  assert.equal(login.status, 200);
  assert.ok(login.body.customerToken && login.body.orders.length >= 3);
  assert.equal((await call('POST', '/me/login', { json: { phone: '0700 000 000', code: cust.code } })).status, 404);
});

test('proof: the customer must approve before printing', async () => {
  const send = (name = 'proof.png') => {
    const f = new FormData();
    f.append('kind', 'proof');
    f.append('file', new Blob([PNG]), name);
    return call('POST', `/orders/${cust.id}/files`, { token: admin, form: f });
  };
  assert.equal((await call('GET', `/orders/track/${cust.code}/proof?key=${cust.key}`)).status, 404); // none yet
  const sent = await send();
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.deepEqual([sent.body.order.status, sent.body.order.proofState], ['proof', 'sent']);

  // The customer sees it.
  const t = (await call('GET', `/orders/track/${cust.code}?key=${cust.key}`)).body.order;
  assert.deepEqual([t.status, t.proof.state, t.proof.mime], ['proof', 'sent', 'image/png']);
  const file = await call('GET', `/orders/track/${cust.code}/proof?key=${cust.key}`);
  assert.equal(file.status, 200);
  assert.equal(file.res.headers.get('content-type'), 'image/png');
  assert.equal(file.body.length, PNG.length);
  assert.equal((await call('GET', `/orders/track/${cust.code}/proof?key=wrong-key-wrong-key`)).status, 404);

  // Printing is held back.
  const early = await call('PATCH', `/orders/${cust.id}`, { token: admin, json: { status: 'printing' } });
  assert.equal(early.status, 409);
  assert.equal(early.body.needs, 'approvedElsewhere');

  // The customer asks for a change: back to the operator, with the message.
  assert.equal((await call('POST', `/orders/track/${cust.code}/proof`, { json: { key: cust.key, action: 'change', message: '' } })).status, 400);
  const change = await call('POST', `/orders/track/${cust.code}/proof`, { json: { key: cust.key, action: 'change', message: 'Make the phone number bigger' } });
  assert.deepEqual([change.body.order.status, change.body.order.proof.state], ['checking', 'changes']);
  const seen = (await call('GET', `/orders/${cust.id}`, { token: admin })).body.order;
  assert.ok(seen.events.some((e) => e.kind === 'proof' && e.data.message === 'Make the phone number bigger'));

  // A new proof, approved this time. It cannot be answered twice.
  await send('proof-2.png');
  const yes = await call('POST', `/orders/track/${cust.code}/proof`, { json: { phone: '0722555666', action: 'approve' } });
  assert.deepEqual([yes.body.order.status, yes.body.order.proof.state], ['approved', 'approved']);
  assert.equal((await call('POST', `/orders/track/${cust.code}/proof`, { json: { key: cust.key, action: 'approve' } })).status, 400);
  assert.equal((await call('PATCH', `/orders/${cust.id}`, { token: admin, json: { status: 'printing' } })).status, 200);
});

test('proof approved by phone: staff can say so, and it is written down', async () => {
  const r = await call('POST', '/orders', { form: productForm(CARDS, { phone: '0722 555 888', name: 'Phone Approver' }) });
  const id = (await call('GET', '/orders?q=Approver', { token: admin })).body.orders[0].id;
  const f = new FormData();
  f.append('kind', 'proof');
  f.append('file', new Blob([PNG]), 'p.png');
  await call('POST', `/orders/${id}/files`, { token: admin, form: f });
  const ok = await call('PATCH', `/orders/${id}`, { token: admin, json: { status: 'printing', approvedElsewhere: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.order.proofState, 'approved');
  const t = (await call('GET', `/orders/track/${r.body.code}?key=${r.body.key}`)).body.order;
  assert.ok(t.events.some((e) => e.kind === 'proof' && e.message === 'Approved by phone or WhatsApp'));
});

test('"I have paid": the customer pastes the M-Pesa message, staff confirm it', async () => {
  const sms = 'UKB7XY12QP Confirmed. Ksh310.00 sent to DISPATCH PRINT for account on 15/11/26 at 10:02 AM.';
  const none = await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: 'I paid yesterday' } });
  assert.equal(none.status, 400);
  const claim = await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: sms } });
  assert.equal(claim.status, 201, JSON.stringify(claim.body));
  assert.deepEqual(claim.body.order.claims.map((c) => [c.reference, c.amount, c.status]), [['UKB7XY12QP', 310, 'pending']]);
  assert.equal(claim.body.order.money.paid, 0, 'a claim is not money yet');
  // The same code again, on this order or another one.
  assert.equal((await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: 'ukb7xy12qp' } })).status, 400);
  assert.match((await call('POST', `/orders/track/${paidCode}/paid`, { json: { phone: '0733111222', text: 'UKB7XY12QP' } })).body.error, /another order/);
  // A code already in the ledger.
  assert.match((await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: 'TKA1B2C3D4' } })).body.error, /already recorded/);

  const order = (await call('GET', `/orders/${cust.id}`, { token: admin })).body.order;
  assert.equal(order.claims, 1);
  const c = order.claimList[0];
  const done = await call('POST', `/orders/${cust.id}/claims/${c.id}`, { token: admin, json: { action: 'confirm' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual([done.body.order.money.paid, done.body.order.money.balance, done.body.order.money.depositDue, done.body.order.claims], [310, 300, 0, 0]);
  assert.equal(done.body.order.money.entries.at(-1).reference, 'UKB7XY12QP');
  assert.equal((await call('POST', `/orders/${cust.id}/claims/${c.id}`, { token: admin, json: { action: 'confirm' } })).status, 400); // only once

  // A code the shop cannot find: rejected, the customer is told, and they may try again.
  await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: 'ZZZ9ZZZ9ZZ', amount: 300 } });
  const list = (await call('GET', `/orders/${cust.id}`, { token: admin })).body.order.claimList;
  const rejected = await call('POST', `/orders/${cust.id}/claims/${list.at(-1).id}`, { token: admin, json: { action: 'reject' } });
  assert.equal(rejected.body.order.money.paid, 310);
  const t = (await call('GET', `/orders/track/${cust.code}?key=${cust.key}`)).body.order;
  assert.ok(t.events.some((e) => e.kind === 'claim' && e.action === 'rejected'));
  assert.equal((await call('POST', `/orders/track/${cust.code}/paid`, { json: { key: cust.key, text: 'ZZZ9ZZZ9ZZ', amount: 300 } })).status, 201);
});

test('an order that is not fully paid is only handed over on purpose', async () => {
  await call('PATCH', `/orders/${cust.id}`, { token: admin, json: { status: 'ready' } });
  const stop = await call('PATCH', `/orders/${cust.id}`, { token: admin, json: { status: 'collected' } });
  assert.equal(stop.status, 409);
  assert.deepEqual([stop.body.needs, stop.body.balance], ['allowOwing', 300]);
  const go = await call('PATCH', `/orders/${cust.id}`, { token: admin, json: { status: 'collected', allowOwing: true } });
  assert.equal(go.status, 200);
  assert.ok(go.body.order.events.some((e) => e.kind === 'note' && /still to pay/.test(e.data.text)));
  // It shows under "owing" customers.
  const owing = (await call('GET', '/customers?filter=owing', { token: admin })).body.customers;
  const w = owing.find((c) => c.name === 'Wanjiru K');
  assert.ok(w && w.owes >= 300 && w.orders >= 3);
  assert.ok(owing.every((c) => c.owes > 0));
  const one = (await call('GET', `/customers/${w.id}`, { token: admin })).body.customer;
  assert.ok(one.orders.length >= 3 && one.orders[0].total > 0);
});

test('order again: same job, today\'s price, the same design, no second design fee', async () => {
  const again = await call('POST', `/orders/track/${cust.code}/reorder`, { json: { key: cust.key, quantity: 200, clientKey: 'reorder-key-0123456789' } });
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.notEqual(again.body.code, cust.code);
  // 200 cards = 10 sheets x 100 = 1000 + cutting 120 = 1120
  assert.equal(again.body.estimate.total, 1120);
  const twice = await call('POST', `/orders/track/${cust.code}/reorder`, { json: { key: cust.key, quantity: 200, clientKey: 'reorder-key-0123456789' } });
  assert.deepEqual([twice.status, twice.body.code], [200, again.body.code]);
  const o = (await call('GET', '/orders?q=Wanjiru&status=new', { token: admin })).body.orders.find((x) => x.code === again.body.code);
  assert.deepEqual([o.source, o.quantity, o.artwork], ['reorder', 200, 'upload']);
  const full = (await call('GET', `/orders/${o.id}`, { token: admin })).body.order;
  assert.equal(full.reorderCode, cust.code);
  assert.equal(full.files.length, 1);
  assert.equal(full.files[0].kind, 'original');
  // The copy is its own file: the first order still has its files.
  const dl = await call('GET', `/orders/${o.id}/files/${full.files[0].id}`, { token: admin });
  assert.equal(dl.body.length, PDF.length);
  assert.equal((await call('GET', `/orders/${cust.id}`, { token: admin })).body.order.files.filter((f) => f.kind === 'original').length, 1);
  assert.equal((await call('POST', `/orders/track/${cust.code}/reorder`, { json: { key: 'nope-nope-nope-nope' } })).status, 404);
});

test('numbered receipt books carry on from the last number', async () => {
  const books = { id: 'receipt-books', choice: { quantity: 5, sets: 50, parts: 2, numberFrom: 1 } };
  const first = await call('POST', '/orders', { form: productForm(books, { phone: '0711 222 333', name: 'Duka Supplies' }) });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const again = await call('POST', `/orders/track/${first.body.code}/reorder`, { json: { key: first.body.key } });
  const o = (await call('GET', '/orders?q=Duka', { token: admin })).body.orders.find((x) => x.code === again.body.code);
  assert.deepEqual([o.summary.numberFrom, o.summary.numberTo], [251, 500]);
  const recipe = (await call('GET', `/orders/${o.id}`, { token: admin })).body.order.recipe;
  assert.deepEqual([recipe.tool, recipe.extra.numbering.start, recipe.extra.numbering.count], ['cutstack', 251, 250]);
});

test('counter order: staff type it in for a walk-in customer', async () => {
  const r = await call('POST', '/orders', { token: admin, form: productForm({ id: 'flyers', choice: { quantity: 250 } }, { phone: '0700 123 456', name: 'Walk In', artwork: 'later' }, null) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.id > 0 && r.body.customerToken === undefined);
  const o = (await call('GET', `/orders/${r.body.id}`, { token: admin })).body.order;
  assert.deepEqual([o.source, o.customerName, o.artwork], ['counter', 'Walk In', 'later']);
  assert.ok(o.trackKey.length >= 16);
  // Staff can also repeat an order for a customer.
  const rep = await call('POST', `/orders/${cust.id}/reorder`, { token: admin, json: {} });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  assert.ok(rep.body.id > 0);
  assert.equal((await call('POST', `/orders/${cust.id}/reorder`, { json: {} })).status, 401);
});

test('open orders are listed soonest-needed first; the local address is for staff only', async () => {
  const open = (await call('GET', '/orders?status=open', { token: admin })).body.orders;
  const dues = open.filter((o) => o.dueAt).map((o) => new Date(o.dueAt).getTime());
  assert.deepEqual(dues, [...dues].sort((a, b) => a - b));
  assert.equal((await call('GET', '/local')).status, 401);
  const local = await call('GET', '/local', { token: admin });
  assert.equal(local.status, 200);
  assert.ok(Array.isArray(local.body.addresses) && ['postgres', 'built-in'].includes(local.body.database));
});
