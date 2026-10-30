import * as auth from './auth.service.js';

export async function setupStatus(_req, res) {
  res.json({ needed: await auth.setupNeeded() });
}

export async function setup(req, res) {
  res.status(201).json(await auth.createFirstAdmin(req.body || {}));
}

export async function login(req, res) {
  res.json(await auth.login(req.body || {}));
}

export async function me(req, res) {
  res.json({ staff: auth.publicStaff(req.staff) });
}

export async function changePassword(req, res) {
  await auth.changeOwnPassword(req.staff.id, req.body || {});
  res.json({ ok: true });
}
