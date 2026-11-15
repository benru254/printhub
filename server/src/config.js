// All settings come from the .env file (see .env.example). Read once, here.
// With NO .env file the server still runs: it keeps its own database in server/data/
// (good for trying PrintHub on one computer). For a hosted shop, set DATABASE_URL.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testing = process.env.NODE_ENV === 'test';
const dataDir = path.resolve(root, process.env.DATA_DIR || './data');

// 'postgres://...' = a PostgreSQL server.  'embedded' (or nothing) = the built-in database
// kept in server/data/db.  'memory' = built-in, forgotten when the server stops (tests).
function databaseUrl() {
  const value = String((testing ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL) || '').trim();
  if (/^postgres(ql)?:\/\//i.test(value)) return value;
  if (value && value !== 'embedded' && value !== 'memory') {
    throw new Error(`${testing ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} must start with postgres:// (or be "embedded"). See server/.env.example.`);
  }
  return testing || value === 'memory' ? 'memory' : 'embedded';
}

// The secret that signs logins. Without one in .env, a random one is made once and kept
// in server/data/secret.key, so staff stay logged in when the server restarts.
function jwtSecret() {
  const given = process.env.JWT_SECRET || '';
  if (/CHANGE_ME/.test(given)) throw new Error('JWT_SECRET in server/.env is still the example value. Put a long random text there, or delete the line.');
  if (given) return given;
  if (testing) return 'test-secret';
  const file = path.join(dataDir, 'secret.key');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch {
    // not made yet
  }
  const fresh = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, `${fresh}\n`, { mode: 0o600 });
  return fresh;
}

export const config = {
  port: Number(process.env.PORT) || 5181,
  databaseUrl: databaseUrl(),
  dataDir,
  jwtSecret: jwtSecret(),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || (testing ? './test-uploads' : './uploads')),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 80,
  countryCode: String(process.env.DEFAULT_COUNTRY_CODE || '254').replace(/\D/g, ''),
  testing,
};

export const usingPostgres = /^postgres/i.test(config.databaseUrl);
