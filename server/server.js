// Starts PrintHub: the API, and the built app when it exists (one address for everything).
// Run: npm start      or, while changing code: npm run dev (restarts by itself)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, usingPostgres } from './src/config.js';
import { pool } from './src/db.js';
import { migrate } from './src/schema.js';
import { createApp, lanAddresses } from './src/app.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('\nCannot connect to PostgreSQL. Check DATABASE_URL in server/.env and that PostgreSQL is running.');
  console.error('Just trying PrintHub on this computer? Delete the DATABASE_URL line from server/.env: PrintHub then uses its built-in database.');
  console.error(`(${e.message})\n`);
  process.exit(1);
}
await migrate();

const app = createApp();
const appBuilt = fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools/imposition/digital-printer/dist/index.html'));
const server = app.listen(config.port, () => {
  const line = (label, value) => console.log(`  ${label.padEnd(26)}${value}`);
  console.log('\nPrintHub is running.\n');
  if (appBuilt) {
    line('On this computer:', `http://localhost:${config.port}`);
    for (const a of lanAddresses(config.port)) line('On a phone (same Wi-Fi):', a);
  } else {
    line('API only:', `http://localhost:${config.port}/api/health`);
    console.log('  The app is not built yet. Run "npm run build" in tools/imposition/digital-printer, then start again.');
  }
  line('Database:', usingPostgres ? 'PostgreSQL (DATABASE_URL)' : `built-in, kept in ${path.join(config.dataDir, 'db')}`);
  line('Customer files:', config.uploadDir);
  console.log('\n  Staff side: add #/staff to the address. Press Ctrl+C to stop.\n');
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${config.port} is already in use: PrintHub is probably running in another window. Close that one first.\n`);
  else console.error(e);
  process.exit(1);
});

// Ctrl+C or a restart: finish the requests in progress, then close the database cleanly.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
