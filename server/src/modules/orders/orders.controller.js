import * as orders from './orders.service.js';
import { acceptUpload, discardUpload, getFileForDownload } from '../files/files.service.js';

// How a customer proves an order is theirs: the phone number, or the key in their tracking link.
const access = (req) => ({ phone: req.query.phone || (req.body || {}).phone, key: req.query.key || (req.body || {}).key });

// ---- public (customers, and staff typing in an order at the counter) ----

export async function create(req, res) {
  let info = null;
  try {
    info = req.file ? await acceptUpload(req.file) : null; // no file: "I need a design" or "I'll send it later"
    const result = await orders.createOrder(req.body || {}, info, req.staff || null);
    if (result.replay && info) await discardUpload({ path: info.fullPath }); // sent twice: keep only the first file
    res.status(result.replay ? 200 : 201).json(result);
  } catch (e) {
    // The order was not saved: don't keep its file.
    await discardUpload(info ? { path: info.fullPath } : req.file);
    throw e;
  }
}

export async function track(req, res) {
  res.json({ order: await orders.trackOrder(req.params.code, access(req)) });
}

export async function proofFile(req, res) {
  const { orderId, fileId } = await orders.trackProofFile(req.params.code, access(req));
  const f = await getFileForDownload(orderId, fileId);
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', 'inline'); // shown on the tracking page, not downloaded
  res.sendFile(f.full);
}

export async function answerProof(req, res) {
  res.json({ order: await orders.answerProof(req.params.code, access(req), req.body || {}) });
}

export async function claimPayment(req, res) {
  res.status(201).json({ order: await orders.claimPayment(req.params.code, access(req), req.body || {}) });
}

export async function customerFile(req, res) {
  let info = null;
  try {
    info = await acceptUpload(req.file);
    res.status(201).json({ order: await orders.addCustomerFile(req.params.code, access(req), info) });
  } catch (e) {
    await discardUpload(info ? { path: info.fullPath } : req.file);
    throw e;
  }
}

export async function reorder(req, res) {
  const result = await orders.reorder(req.params.code, access(req), req.body || {}, req.staff || null);
  res.status(result.replay ? 200 : 201).json(result);
}

export async function myOrders(req, res) {
  res.json(await orders.customerOrders(req.customerId));
}

export async function customerLogin(req, res) {
  res.json(await orders.customerLogin(req.body || {}));
}

export function statuses(_req, res) {
  res.json({ statuses: orders.STATUS_TEXT });
}

// ---- staff ----

export async function list(req, res) {
  res.json(await orders.listOrders({ status: req.query.status, q: req.query.q, limit: req.query.limit }));
}

export async function detail(req, res) {
  res.json({ order: await orders.getOrder(Number(req.params.id)) });
}

export async function update(req, res) {
  res.json({ order: await orders.updateOrder(req.staff.id, Number(req.params.id), req.body || {}) });
}

export async function note(req, res) {
  res.json({ order: await orders.addNote(req.staff.id, Number(req.params.id), (req.body || {}).text) });
}

export async function staffReorder(req, res) {
  res.status(201).json(await orders.reorderById(req.staff, Number(req.params.id), req.body || {}));
}
