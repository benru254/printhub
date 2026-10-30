import * as staff from './staff.service.js';

export async function list(_req, res) {
  res.json({ staff: await staff.listStaff() });
}

export async function create(req, res) {
  res.status(201).json({ staff: await staff.createStaff(req.staff.id, req.body || {}) });
}

export async function update(req, res) {
  res.json({ staff: await staff.updateStaff(req.staff.id, Number(req.params.id), req.body || {}) });
}
