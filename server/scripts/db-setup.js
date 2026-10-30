// Checks the database connection and creates the tables. Safe to run many times.
// Run: npm run db:setup
import { config } from '../src/config.js';
import { pool, get } from '../src/db.js';
import { migrate } from '../src/schema.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('\nCannot connect to PostgreSQL.');
  console.error(`  DATABASE_URL = ${config.databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);
  console.error(`  ${e.message}\n`);
  console.error('Check: PostgreSQL is running, the database "printhub" exists, and the user and password are right.');
  process.exit(1);
}

await migrate();
const { n } = await get('SELECT count(*)::int AS n FROM staff');
console.log('Database is ready. Tables: staff, customers, orders, order_files, order_events, staff_events.');
console.log(n === 0 ? 'No staff yet: open the app at #/staff to create the first admin.' : `${n} staff account(s).`);
await pool.end();
