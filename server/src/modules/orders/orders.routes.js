import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireStaff } from '../../middleware/auth.js';
import { uploadOne } from '../files/files.service.js';
import * as c from './orders.controller.js';

// Customers: 20 orders and 60 tracking checks per hour per device.
const sendLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many orders from this device. Try again later or call the shop.' } });
const trackLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many checks. Try again later.' } });

export const orderRoutes = Router();

// Specific routes BEFORE /orders/:id
orderRoutes.post('/orders', sendLimit, uploadOne, c.create);
orderRoutes.get('/orders/statuses', c.statuses);
orderRoutes.get('/orders/track/:code', trackLimit, c.track);

orderRoutes.get('/orders', requireStaff, c.list);
orderRoutes.get('/orders/:id', requireStaff, c.detail);
orderRoutes.patch('/orders/:id', requireStaff, c.update);
orderRoutes.post('/orders/:id/notes', requireStaff, c.note);
