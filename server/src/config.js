// All settings come from the .env file (see .env.example). Read once, here.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testing = process.env.NODE_ENV === 'test';

function required(name, value) {
  if (!value) throw new Error(`${name} is missing. Copy server/.env.example to server/.env and fill it in.`);
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 5181,
  databaseUrl: required(
    testing ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
    testing ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL
  ),
  jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET || (testing ? 'test-secret' : '')),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || (testing ? './test-uploads' : './uploads')),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 80,
  countryCode: String(process.env.DEFAULT_COUNTRY_CODE || '254').replace(/\D/g, ''),
  testing,
};

if (!testing && /CHANGE_ME/.test(config.jwtSecret)) {
  throw new Error('JWT_SECRET in server/.env is still the example value. Put a long random text there.');
}
