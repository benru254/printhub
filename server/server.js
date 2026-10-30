// Starts the PrintHub API. Run: npm run dev   (restarts by itself when you change a file)
import { config } from './src/config.js';
import { pool } from './src/db.js';
import { migrate } from './src/schema.js';
import { createApp } from './src/app.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('\nCannot connect to PostgreSQL. Check DATABASE_URL in server/.env and that PostgreSQL is running.');
  console.error(`(${e.message})\n`);
  process.exit(1);
}
await migrate();

const app = createApp();
app.listen(config.port, () => {
  console.log(`PrintHub API running on http://localhost:${config.port}/api/health`);
  console.log(`Files are saved in ${config.uploadDir}`);
});
