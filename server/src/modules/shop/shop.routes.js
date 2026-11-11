import { Router } from 'express';
import { requireStaff, requireAdmin } from '../../middleware/auth.js';
import * as c from './shop.controller.js';

export const shopRoutes = Router();
shopRoutes.get('/shop', c.read); // public: name, WhatsApp, prices, printers
shopRoutes.put('/shop', requireStaff, requireAdmin, c.update);
