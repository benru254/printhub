// API tests. They use TEST_DATABASE_URL (a separate, empty database): every run WIPES it.
// Run: npm test
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
  // Safety: never wipe the real shop database.
  const { db } = (await pool.query('SELECT current_database() AS db')).rows[0];
  if (!/test/i.test(db) || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error(`Refusing to run tests on database "${db}". TEST_DATABASE_URL must point to a separate database with "test" in its name.`);
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
