import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireStaff, requireCustomer, optionalStaff } from '../../middleware/auth.js';
import { uploadOne } from '../files/files.service.js';
import * as c from './orders.controller.js';

// Per device, per hour: 20 orders, 120 looks at the tracking page, 30 customer actions
// (approve a proof, "I have paid", send a file, order again), 10 tries to open "my orders".
// Staff typing orders in at the counter are not limited.
const limit = (n, message) => rateLimit({ windowMs: 60 * 60 * 1000, limit: n, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message }, skip: (req) => !!req.staff });
const sendLimit = limit(20, 'Too many orders from this device. Try again later or call the shop.');
const trackLimit = limit(120, 'Too many checks. Try again later.');
const actLimit = limit(30, 'Too many tries from this device. Try again later or call the shop.');
const loginLimit = limit(10, 'Too many tries. Wait an hour and try again.');

export const orderRoutes = Router();

// Specific routes BEFORE /orders/:id
orderRoutes.post('/orders', optionalStaff, sendLimit, uploadOne, c.create);
orderRoutes.get('/orders/statuses', c.statuses);
orderRoutes.get('/orders/track/:code', trackLimit, c.track);
orderRoutes.get('/orders/track/:code/proof', trackLimit, c.proofFile);
orderRoutes.post('/orders/track/:code/proof', actLimit, c.answerProof);
orderRoutes.post('/orders/track/:code/paid', actLimit, c.claimPayment);
orderRoutes.post('/orders/track/:code/files', actLimit, uploadOne, c.customerFile);
orderRoutes.post('/orders/track/:code/reorder', optionalStaff, actLimit, c.reorder);

// A customer's own orders (the token their phone got with their first order).
orderRoutes.get('/me/orders', requireCustomer, c.myOrders);
orderRoutes.post('/me/login', loginLimit, c.customerLogin);

orderRoutes.get('/orders', requireStaff, c.list);
orderRoutes.get('/orders/:id', requireStaff, c.detail);
orderRoutes.patch('/orders/:id', requireStaff, c.update);
orderRoutes.post('/orders/:id/notes', requireStaff, c.note);
orderRoutes.post('/orders/:id/reorder', requireStaff, c.staffReorder);
