// Staff log in and get a token. Every staff request sends: Authorization: Bearer <token>
// The staff row is re-read on every request, so a deactivated account stops working at once.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db.js';
import { unauthorized, forbidden } from '../lib/errors.js';

const TOKEN_HOURS = 12;

export function signToken(staff) {
  return jwt.sign({ sub: staff.id, role: staff.role, kind: 'staff' }, config.jwtSecret, { expiresIn: `${TOKEN_HOURS}h` });
}

// Customers have no password. After their first order the phone keeps this token, which
// only lets it see and repeat that customer's own orders. It can never be used as staff.
const CUSTOMER_DAYS = 365;

export function signCustomerToken(customerId) {
  return jwt.sign({ sub: customerId, kind: 'customer' }, config.jwtSecret, { expiresIn: `${CUSTOMER_DAYS}d` });
}

function bearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function requireCustomer(req, _res, next) {
  try {
    const payload = jwt.verify(bearer(req) || '', config.jwtSecret);
    if (payload.kind !== 'customer') throw new Error('not a customer token');
    req.customerId = Number(payload.sub);
    next();
  } catch {
    next(unauthorized('Enter your phone number and an order code to see your orders.'));
  }
}

// For addresses customers and staff both use (sending an order): notes who is logged in, never refuses.
export async function optionalStaff(req, _res, next) {
  try {
    const token = bearer(req);
    if (token) {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.kind !== 'customer') {
        const staff = await get('SELECT id, name, username, role, active FROM staff WHERE id = $1', [payload.sub]);
        if (staff && staff.active) req.staff = staff;
      }
    }
  } catch {
    // not logged in: carry on as a customer
  }
  next();
}

export async function requireStaff(req, _res, next) {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Your login has expired. Please log in again.');
    }
    if (payload.kind === 'customer') throw unauthorized(); // a customer's token is never a staff login
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
