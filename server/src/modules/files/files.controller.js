// Staff: add a file to an order, and download any file of an order.
import { addFile } from '../orders/orders.service.js';
import { acceptUpload, discardUpload, getFileForDownload, FILE_KINDS } from './files.service.js';
import { badRequest } from '../../lib/errors.js';

export async function uploadFile(req, res) {
  let info = null;
  try {
    const kind = (req.body || {}).kind || 'operator';
    if (!FILE_KINDS.includes(kind) || kind === 'original') throw badRequest('Staff can add "operator" or "imposed" files.');
    info = await acceptUpload(req.file);
    res.status(201).json({ order: await addFile(req.staff.id, Number(req.params.id), kind, info) });
  } catch (e) {
    await discardUpload(info ? { path: info.fullPath } : req.file);
    throw e;
  }
}

export async function download(req, res) {
  const f = await getFileForDownload(Number(req.params.id), Number(req.params.fileId));
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(f.full);
}
