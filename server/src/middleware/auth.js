// Staff log in and get a token. Every staff request sends: Authorization: Bearer <token>
// The staff row is re-read on every request, so a deactivated account stops working at once.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db.js';
import { unauthorized, forbidden } from '../lib/errors.js';

const TOKEN_HOURS = 12;

export function signToken(staff) {
  return jwt.sign({ sub: staff.id, role: staff.role }, config.jwtSecret, { expiresIn: `${TOKEN_HOURS}h` });
}

export async function requireStaff(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Your login has expired. Please log in again.');
    }
    const staff = await get('SELECT id, name, username, role, active FROM staff WHERE id = $1', [payload.sub]);
    if (!staff || !staff.active) throw unauthorized('This account is not active.');
    req.staff = staff;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req, _res, next) {
  if (!req.staff || req.staff.role !== 'admin') return next(forbidden('Only an admin can do this.'));
  next();
}
