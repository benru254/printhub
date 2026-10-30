import { Router } from 'express';
import { requireStaff, requireAdmin } from '../../middleware/auth.js';
import * as c from './staff.controller.js';

export const staffRoutes = Router();
staffRoutes.use('/staff', requireStaff, requireAdmin);
staffRoutes.get('/staff', c.list);
staffRoutes.post('/staff', c.create);
staffRoutes.patch('/staff/:id', c.update);
