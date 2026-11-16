// Shop-wide settings every customer's app reads: shop name, WhatsApp number, how to pay,
// the price list, the products (catalogue) and the shop's printers (so customers see the
// real "how many per sheet", not a guess).
import { all, transaction } from '../../db.js';
import { badRequest } from '../../lib/errors.js';
import { normalizePhone } from '../../lib/phone.js';
import { DEFAULT_PRICE_LIST, cleanPriceList } from '../../../../tools/imposition/digital-printer/engine/core/pricing.js';
import { DEFAULT_CATALOGUE, cleanCatalogue } from '../../../../tools/imposition/digital-printer/engine/core/catalogue.js';
import { cleanClosedDays } from '../../../../tools/imposition/digital-printer/engine/core/workdays.js';

export const PAY_METHODS = ['none', 'till', 'paybill', 'pochi', 'phone'];

const DEFAULT_SHOP = {
  name: 'PrintHub',
  whatsapp: '',
  turnaroundDays: 2,
  address: '', // where customers collect
  hours: '', // e.g. "Mon-Sat 8am-6pm"
  pin: '', // KRA PIN, printed on receipts
  closedDays: [0], // 0 = Sunday
  // How customers pay. method: 'till' (Buy Goods), 'paybill', 'pochi', 'phone' (Send Money) or 'none'.
  pay: { method: 'none', number: '', account: '', name: '', depositPct: 50 },
};
const MAX_JSON = 200 * 1024;

async function readAll(db = { all }) {
  const rows = await db.all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const shopFrom = (s) => ({ ...DEFAULT_SHOP, ...(s.shop || {}), pay: { ...DEFAULT_SHOP.pay, ...((s.shop && s.shop.pay) || {}) } });

export async function getPriceList(db) {
  const s = await readAll(db);
  return s.priceList || DEFAULT_PRICE_LIST;
}

// Everything pricing and ordering need, read once (db = plain helpers or a transaction).
export async function shopData(db) {
  const s = await readAll(db);
  return {
    shop: shopFrom(s),
    priceList: s.priceList || DEFAULT_PRICE_LIST,
    catalogue: s.catalogue || DEFAULT_CATALOGUE,
    printers: (s.printers && s.printers.printers) || [],
    customSheets: (s.printers && s.printers.customSheets) || [],
  };
}

// Public: safe for anyone to read.
export function getShop() {
  return shopData();
}

function cleanPay(input = {}) {
  const method = PAY_METHODS.includes(input.method) ? input.method : 'none';
  const number = String(input.number || '').replace(/\D/g, '').slice(0, 13);
  if (method !== 'none' && number.length < 5) throw badRequest('Enter the number customers pay to.');
  const pct = Math.round(Number(input.depositPct));
  return {
    method,
    number,
    account: String(input.account || '').trim().slice(0, 20),
    name: String(input.name || '').trim().slice(0, 40),
    depositPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : DEFAULT_SHOP.pay.depositPct,
  };
}

function cleanShop(input) {
  const name = String((input && input.name) || '').trim().slice(0, 60);
  if (!name) throw badRequest('Enter the shop name.');
  const raw = String((input && input.whatsapp) || '').trim();
  const whatsapp = raw ? normalizePhone(raw) : '';
  if (raw && !whatsapp) throw badRequest('The WhatsApp number is not a valid phone number.');
  const days = Math.max(0, Math.min(60, Math.round(Number(input.turnaroundDays))));
  return {
    name,
    whatsapp,
    turnaroundDays: Number.isFinite(days) ? days : DEFAULT_SHOP.turnaroundDays,
    address: String(input.address || '').trim().slice(0, 120),
    hours: String(input.hours || '').trim().slice(0, 80),
    pin: String(input.pin || '').trim().toUpperCase().slice(0, 20),
    closedDays: cleanClosedDays(input.closedDays, DEFAULT_SHOP.closedDays),
    pay: cleanPay(input.pay),
  };
}

function cleanPrinters(input) {
  const printers = Array.isArray(input && input.printers) ? input.printers : null;
  const customSheets = Array.isArray(input && input.customSheets) ? input.customSheets : [];
  if (!printers || !printers.length) throw badRequest('There are no printers to publish.');
  if (JSON.stringify(input).length > MAX_JSON) throw badRequest('The printer list is too big.');
  for (const p of printers) {
    if (!p || typeof p.name !== 'string' || !Array.isArray(p.sheets) || !p.sheets.length) throw badRequest('A printer in the list is not valid.');
  }
  return { printers: printers.slice(0, 20), customSheets: customSheets.slice(0, 40) };
}

// The engine's checks throw plain errors with a message for the shop owner.
function checked(fn) {
  try {
    return fn();
  } catch (e) {
    throw badRequest(e.message);
  }
}

// Admin: patch = { shop?, priceList?, catalogue?, printers? }. Every change is written to staff_events.
export async function updateShop(staffId, patch = {}) {
  const changes = {};
  if (patch.shop !== undefined) changes.shop = cleanShop(patch.shop);
  if (patch.priceList !== undefined) changes.priceList = checked(() => cleanPriceList(patch.priceList));
  if (patch.catalogue !== undefined) {
    if (JSON.stringify(patch.catalogue).length > MAX_JSON) throw badRequest('The product list is too big.');
    changes.catalogue = checked(() => cleanCatalogue(patch.catalogue));
  }
  if (patch.printers !== undefined) changes.printers = cleanPrinters(patch.printers);
  if (!Object.keys(changes).length) throw badRequest('Nothing to save.');

  await transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      await tx.run(
        `INSERT INTO settings (key, value, updated_by_staff_id) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by_staff_id = EXCLUDED.updated_by_staff_id, updated_at = now()`,
        [key, JSON.stringify(value), staffId]
      );
      await tx.run(`INSERT INTO staff_events (staff_id, kind, data) VALUES ($1, 'settings', $2)`, [staffId, { key, value }]);
    }
  });
  return getShop();
}
