import * as money from './money.service.js';
import { getOrder } from '../orders/orders.service.js';

export async function setPrice(req, res) {
  await money.setPrice(req.staff.id, Number(req.params.id), req.body || {});
  res.json({ order: await getOrder(Number(req.params.id)) });
}

export async function addMoney(req, res) {
  await money.addMoney(req.staff.id, Number(req.params.id), req.body || {});
  res.status(201).json({ order: await getOrder(Number(req.params.id)) });
}

export async function summary(req, res) {
  res.json({ summary: await money.daySummary({ from: req.query.from, to: req.query.to }) });
}
