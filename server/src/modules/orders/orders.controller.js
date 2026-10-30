import * as orders from './orders.service.js';
import { acceptUpload, discardUpload } from '../files/files.service.js';

// ---- public (customers) ----

export async function create(req, res) {
  let info = null;
  try {
    info = await acceptUpload(req.file);
    res.status(201).json(await orders.createOrder(req.body || {}, info));
  } catch (e) {
    // The order was not saved: don't keep its file.
    await discardUpload(info ? { path: info.fullPath } : req.file);
    throw e;
  }
}

export async function track(req, res) {
  res.json({ order: await orders.trackOrder(req.params.code, req.query.phone) });
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
