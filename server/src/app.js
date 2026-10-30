// The Express app (no listening here, so tests can use it directly).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { errorHandler, notFound } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { staffRoutes } from './modules/staff/staff.routes.js';
import { customerRoutes } from './modules/customers/customers.routes.js';
import { orderRoutes } from './modules/orders/orders.routes.js';
import { fileRoutes } from './modules/files/files.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The built imposition app (npm run build in tools/imposition/digital-printer), if it exists.
const APP_DIST = path.resolve(here, '../../tools/imposition/digital-printer/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // correct customer IP behind the Vite proxy / a local reverse proxy
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use(authRoutes);
  api.use(staffRoutes);
  api.use(customerRoutes);
  api.use(fileRoutes); // /orders/:id/files... before the orders routes
  api.use(orderRoutes);
  api.use((_req, _res, next) => next(notFound('No such API address.')));
  app.use('/api', api);

  // One address for everything when the app has been built: http://<pc>:5181
  if (fs.existsSync(path.join(APP_DIST, 'index.html'))) {
    app.use(express.static(APP_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(APP_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
