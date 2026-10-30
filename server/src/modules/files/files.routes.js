import { Router } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import { uploadOne } from './files.service.js';
import * as c from './files.controller.js';

export const fileRoutes = Router();
fileRoutes.post('/orders/:id/files', requireStaff, uploadOne, c.uploadFile);
fileRoutes.get('/orders/:id/files/:fileId', requireStaff, c.download);
