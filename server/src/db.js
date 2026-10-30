// PostgreSQL connection pool and three small helpers.
//   all(sql, params) -> rows     get(sql, params) -> first row or null     run(sql, params) -> result
// Always use $1, $2... placeholders. Never put customer text into the SQL string.
import pg from 'pg';
import { config } from './config.js';

// Return BIGINT counts as numbers and keep dates as JS Dates.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function all(sql, params = []) {
  return (await pool.query(sql, params)).rows;
}

export async function get(sql, params = []) {
  return (await pool.query(sql, params)).rows[0] || null;
}

export async function run(sql, params = []) {
  return pool.query(sql, params);
}

// Runs fn(client) inside one transaction: everything is saved, or nothing is.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      all: async (sql, params = []) => (await client.query(sql, params)).rows,
      get: async (sql, params = []) => (await client.query(sql, params)).rows[0] || null,
      run: (sql, params = []) => client.query(sql, params),
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
