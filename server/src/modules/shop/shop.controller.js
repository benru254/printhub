import * as shop from './shop.service.js';

export async function read(_req, res) {
  res.json(await shop.getShop());
}

export async function update(req, res) {
  res.json(await shop.updateShop(req.staff.id, req.body || {}));
}
