import * as customers from './customers.service.js';

export async function list(req, res) {
  res.json({ customers: await customers.listCustomers({ q: req.query.q, limit: req.query.limit }) });
}

export async function detail(req, res) {
  res.json({ customer: await customers.getCustomer(Number(req.params.id)) });
}
