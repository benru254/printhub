import { Router } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import * as c from './customers.controller.js';

export const customerRoutes = Router();
customerRoutes.get('/customers', requireStaff, c.list);
customerRoutes.get('/customers/:id', requireStaff, c.detail);
