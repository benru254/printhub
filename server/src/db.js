// The database, and three small helpers.
//   all(sql, params) -> rows     get(sql, params) -> first row or null     run(sql, params) -> result
// Always use $1, $2... placeholders. Never put customer text into the SQL string.
//
// Two ways to run, the SAME SQL for both:
//   PostgreSQL server  (DATABASE_URL=postgres://...)  for a hosted shop
//   built-in database  (no DATABASE_URL)              PostgreSQL inside this program (PGlite),
//                                                     kept in server/data/db. Nothing to install.
import path from 'node:path';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config, usingPostgres } from './config.js';

let backend;

if (usingPostgres) {
  const pg = (await import('pg')).default;
  // Return BIGINT counts as numbers and keep dates as JS Dates.
  pg.types.setTypeParser(20, (v) => Number(v));
  const pgPool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  backend = {
    query: (sql, params = []) => pgPool.query(sql, params),
    end: () => pgPool.end(),
    async transaction(fn) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn((sql, params = []) => client.query(sql, params));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = config.databaseUrl === 'memory' ? undefined : path.join(config.dataDir, 'db');
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  // The built-in database has ONE connection. A transaction keeps it to itself until it
  // ends; everything else waits its turn. Queries made from inside a transaction (even
  // through the plain helpers) join that transaction instead of waiting for themselves.
  const inside = new AsyncLocalStorage();
  let line = Promise.resolve();
  const turn = (work) => {
    const mine = line.then(work, work);
    line = mine.then(() => {}, () => {});
    return mine;
  };
  // pg sends objects as JSON and dates as text; do the same here.
  const param = (v) => (v instanceof Date ? v.toISOString() : v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
  const direct = async (sql, params = []) => {
    if (params.length) return db.query(sql, params.map(param));
    const results = await db.exec(sql); // may hold several statements
    return results[results.length - 1] || { rows: [] };
  };
  backend = {
    query: (sql, params = []) => (inside.getStore() ? direct(sql, params) : turn(() => direct(sql, params))),
    end: () => db.close(),
    transaction(fn) {
      if (inside.getStore()) return fn(direct); // already in one: join it
      return turn(() =>
        inside.run(true, async () => {
          await direct('BEGIN');
          try {
            const result = await fn(direct);
            await direct('COMMIT');
            return result;
          } catch (e) {
            await direct('ROLLBACK');
            throw e;
          }
        })
      );
    },
  };
}

// Kept under the old name: server.js and the tests use pool.query and pool.end.
export const pool = { query: backend.query, end: backend.end };

export async function all(sql, params = []) {
  return (await backend.query(sql, params)).rows;
}

export async function get(sql, params = []) {
  return (await backend.query(sql, params)).rows[0] || null;
}

export async function run(sql, params = []) {
  return backend.query(sql, params);
}

// Runs fn(tx) inside one transaction: everything is saved, or nothing is.
export async function transaction(fn) {
  return backend.transaction((query) =>
    fn({
      all: async (sql, params = []) => (await query(sql, params)).rows,
      get: async (sql, params = []) => (await query(sql, params)).rows[0] || null,
      run: (sql, params = []) => query(sql, params),
    })
  );
}
