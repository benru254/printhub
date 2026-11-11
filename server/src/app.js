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
import { shopRoutes } from './modules/shop/shop.routes.js';
import { moneyRoutes } from './modules/money/money.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The built imposition app (npm run build in tools/imposition/digital-printer), if it exists.
const APP_DIST = path.resolve(here, '../../tools/imposition/digital-printer/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // correct customer IP behind the Vite proxy / a local reverse proxy
  // Basic browser safety for every answer.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); // orders and prices are never served stale
    next();
  });
  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use(authRoutes);
  api.use(staffRoutes);
  api.use(customerRoutes);
  api.use(shopRoutes);
  api.use(moneyRoutes); // /orders/:id/price, /orders/:id/payments
  api.use(fileRoutes); // /orders/:id/files... before the orders routes
  api.use(orderRoutes);
  api.use((_req, _res, next) => next(notFound('No such API address.')));
  app.use('/api', api);

  // One address for everything when the app has been built: http://<pc>:5181
  if (fs.existsSync(path.join(APP_DIST, 'index.html'))) {
    // Files with a fingerprint in their name never change: phones may keep them for a year.
    app.use(express.static(APP_DIST, {
      setHeaders(res, file) {
        res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(APP_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
