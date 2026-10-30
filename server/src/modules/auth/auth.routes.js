import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireStaff } from '../../middleware/auth.js';
import * as c from './auth.controller.js';

// 10 login tries per 15 minutes per device, so passwords can't be guessed.
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many tries. Wait 15 minutes and try again.' },
});

export const authRoutes = Router();
authRoutes.get('/setup', c.setupStatus);
authRoutes.post('/setup', loginLimit, c.setup);
authRoutes.post('/auth/login', loginLimit, c.login);
authRoutes.get('/auth/me', requireStaff, c.me);
authRoutes.post('/auth/password', requireStaff, c.changePassword);
