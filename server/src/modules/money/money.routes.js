import { Router } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import * as c from './money.controller.js';

export const moneyRoutes = Router();
moneyRoutes.get('/money/summary', requireStaff, c.summary);
moneyRoutes.put('/orders/:id/price', requireStaff, c.setPrice);
moneyRoutes.post('/orders/:id/payments', requireStaff, c.addMoney);
