// Files are kept in a folder on the server (UPLOAD_DIR), never in the database.
//   UPLOAD_DIR/2026/10/3f1c...e9.pdf     <- stored_name = "2026/10/3f1c...e9.pdf"
// The database row keeps the customer's file name, size and a SHA-256 fingerprint.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../../config.js';
import { all, get } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';

export const FILE_KINDS = ['original', 'imposed', 'operator'];

// Only these, checked by the first bytes of the file (not the name the phone sends).
const TYPES = [
  { ext: '.pdf', mime: 'application/pdf', test: (b) => b.slice(0, 5).toString('latin1') === '%PDF-' },
  { ext: '.png', mime: 'image/png', test: (b) => b[0] === 0x89 && b.slice(1, 4).toString('latin1') === 'PNG' },
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

function monthFolder() {
  const d = new Date();
  return path.join(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'));
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(config.uploadDir, monthFolder());
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(_req, _file, cb) {
    cb(null, `${crypto.randomUUID()}.upload`);
  },
});

// One file in the field "file".
export const uploadOne = multer({ storage, limits: { fileSize: config.maxUploadMb * 1048576, files: 1, fields: 20, fieldSize: 512 * 1024 } }).single('file');

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function firstBytes(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    return buf;
  } finally {
    await fh.close();
  }
}

export async function discardUpload(file) {
  if (file && file.path) await fsp.rm(file.path, { force: true });
}

// Checks the uploaded file and renames it to its real type. Returns what to store in order_files.
export async function acceptUpload(file) {
  if (!file) throw badRequest('Please attach the file.');
  const head = await firstBytes(file.path);
  const type = TYPES.find((t) => t.test(head));
  if (!type) {
    await discardUpload(file);
    throw badRequest('Only PDF, PNG or JPG files can be sent.');
  }
  const finalPath = file.path.replace(/\.upload$/, type.ext);
  await fsp.rename(file.path, finalPath);
  return {
    originalName: String(file.originalname || `file${type.ext}`).slice(0, 200),
    storedName: path.relative(config.uploadDir, finalPath).split(path.sep).join('/'),
    mime: type.mime,
    size: file.size,
    sha256: await sha256(finalPath),
    fullPath: finalPath,
  };
}

// db = transaction helper or plain helpers
export async function recordFile(db, orderId, kind, info, staffId = null) {
  if (!FILE_KINDS.includes(kind)) throw badRequest('Unknown file kind.');
  return db.get(
    `INSERT INTO order_files (order_id, kind, original_name, stored_name, mime, size_bytes, sha256, uploaded_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, kind, original_name AS "name", mime, size_bytes AS "size", sha256, created_at AS "createdAt"`,
    [orderId, kind, info.originalName, info.storedName, info.mime, info.size, info.sha256, staffId]
  );
}

export function listFiles(orderId) {
  return all(
    `SELECT f.id, f.kind, f.original_name AS "name", f.mime, f.size_bytes AS "size", f.sha256, f.created_at AS "createdAt",
            s.name AS "uploadedBy"
       FROM order_files f LEFT JOIN staff s ON s.id = f.uploaded_by_staff_id
      WHERE f.order_id = $1 ORDER BY f.created_at`,
    [orderId]
  );
}

export async function getFileForDownload(orderId, fileId) {
  const f = await get('SELECT * FROM order_files WHERE id = $1 AND order_id = $2', [fileId, orderId]);
  if (!f) throw notFound('File not found.');
  const full = path.resolve(config.uploadDir, f.stored_name);
  // Never serve anything outside the upload folder.
  if (!full.startsWith(config.uploadDir + path.sep)) throw notFound('File not found.');
  try {
    await fsp.access(full);
  } catch {
    throw notFound('The file is missing from the server folder.');
  }
  return { full, name: f.original_name, mime: f.mime };
}
