// Shop-wide settings every customer's app reads: shop name, WhatsApp number, the price list
// and the shop's printers (so customers see the real "how many per sheet", not a guess).
import { all, transaction } from '../../db.js';
import { badRequest } from '../../lib/errors.js';
import { normalizePhone } from '../../lib/phone.js';
import { DEFAULT_PRICE_LIST, cleanPriceList } from '../../../../tools/imposition/digital-printer/engine/core/pricing.js';

const DEFAULT_SHOP = { name: 'PrintHub', whatsapp: '', turnaroundDays: 2 };
const MAX_JSON = 200 * 1024;

async function readAll(db = { all }) {
  const rows = await db.all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getPriceList(db) {
  const s = await readAll(db);
  return s.priceList || DEFAULT_PRICE_LIST;
}

// Public: safe for anyone to read.
export async function getShop() {
  const s = await readAll();
  return {
    shop: { ...DEFAULT_SHOP, ...(s.shop || {}) },
    priceList: s.priceList || DEFAULT_PRICE_LIST,
    printers: (s.printers && s.printers.printers) || [],
    customSheets: (s.printers && s.printers.customSheets) || [],
  };
}

function cleanShop(input) {
  const name = String((input && input.name) || '').trim().slice(0, 60);
  if (!name) throw badRequest('Enter the shop name.');
  const raw = String((input && input.whatsapp) || '').trim();
  const whatsapp = raw ? normalizePhone(raw) : '';
  if (raw && !whatsapp) throw badRequest('The WhatsApp number is not a valid phone number.');
  const days = Math.max(0, Math.min(60, Math.round(Number(input.turnaroundDays))));
  return { name, whatsapp, turnaroundDays: Number.isFinite(days) ? days : DEFAULT_SHOP.turnaroundDays };
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

// Admin: patch = { shop?, priceList?, printers? }. Every change is written to staff_events.
export async function updateShop(staffId, patch = {}) {
  const changes = {};
  if (patch.shop !== undefined) changes.shop = cleanShop(patch.shop);
  if (patch.priceList !== undefined) {
    try {
      changes.priceList = cleanPriceList(patch.priceList);
    } catch (e) {
      throw badRequest(e.message);
    }
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
