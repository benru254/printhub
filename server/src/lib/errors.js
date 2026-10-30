// HttpError: throw it anywhere in a service and the customer/staff sees `message`.
// Any other error is logged and shown as a generic message (no internals leak out).

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const forbidden = (msg = 'You are not allowed to do this.') => new HttpError(403, msg);
export const unauthorized = (msg = 'Please log in.') => new HttpError(401, msg);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  // Multer (file upload) errors
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The file is too big.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ error: `Upload problem: ${err.message}` });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
