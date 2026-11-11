// Database tables. ADDITIVE ONLY: never drop or rename. To change something, add a new
// statement at the end (CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
// Runs on every server start, so it is safe to run many times.
import { run } from './db.js';

export const ORDER_STATUSES = ['new', 'checking', 'needs_customer', 'approved', 'printing', 'ready', 'collected', 'cancelled'];

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    tool TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    recipe JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    assigned_staff_id INTEGER REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id)`,

  `CREATE TABLE IF NOT EXISTS order_files (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    kind TEXT NOT NULL CHECK (kind IN ('original', 'imposed', 'operator')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    uploaded_by_staff_id INTEGER REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS order_files_order_idx ON order_files (order_id)`,

  // Who did what to an order. Never updated or deleted.
  // kind: created | status | note | message | assigned | file | edited
  // public = the customer can see it on the tracking page.
  `CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    staff_id INTEGER REFERENCES staff(id),
    kind TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at)`,

  // Who changed staff accounts. Never updated or deleted.
  `CREATE TABLE IF NOT EXISTS staff_events (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER REFERENCES staff(id),
    target_staff_id INTEGER REFERENCES staff(id),
    kind TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---- Part 9: shop settings, prices and the money ledger ----

  // Shop-wide settings, one row per key: 'shop' (name, WhatsApp), 'priceList', 'printers'.
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by_staff_id INTEGER REFERENCES staff(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // The price worked out when the order was sent (lines, discount, total) and what it was priced from.
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote JSONB`,
  // A random key from the customer's phone, so a double tap or a retry never makes two orders.
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_key TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_client_key_idx ON orders (client_key) WHERE client_key IS NOT NULL`,
  // When the customer wants it.
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`,

  // MONEY IS A LEDGER. Rows are only ever added, never changed or deleted.
  //   charge  = what the customer owes (the first one is the estimate; a price change adds
  //             another charge for the difference, which can be negative)
  //   payment = money received        refund = money given back
  // An order's price, paid amount and balance are always worked out from these rows.
  `CREATE TABLE IF NOT EXISTS order_ledger (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    kind TEXT NOT NULL CHECK (kind IN ('charge', 'payment', 'refund')),
    amount_cents BIGINT NOT NULL,
    method TEXT,
    reference TEXT,
    note TEXT NOT NULL DEFAULT '',
    staff_id INTEGER REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS order_ledger_order_idx ON order_ledger (order_id)`,
  // The same M-Pesa code can never be recorded twice.
  `CREATE UNIQUE INDEX IF NOT EXISTS order_ledger_reference_idx ON order_ledger (method, upper(reference)) WHERE kind = 'payment' AND reference IS NOT NULL AND reference <> ''`,
];

export async function migrate() {
  for (const sql of STATEMENTS) await run(sql);
}
