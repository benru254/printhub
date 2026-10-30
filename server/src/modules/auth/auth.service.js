// Logging in, the first admin, and changing your own password.
import bcrypt from 'bcryptjs';
import { get, run, transaction } from '../../db.js';
import { badRequest, unauthorized, forbidden } from '../../lib/errors.js';
import { signToken } from '../../middleware/auth.js';

export const MIN_PASSWORD = 8;

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw badRequest(`The password must be at least ${MIN_PASSWORD} characters.`);
  }
}

export function cleanUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw badRequest('Username: 3 to 30 letters, numbers, dots or dashes. No spaces.');
  return u;
}

export const publicStaff = (s) => ({ id: s.id, name: s.name, username: s.username, role: s.role, active: s.active });

export async function setupNeeded() {
  const row = await get('SELECT count(*)::int AS n FROM staff');
  return row.n === 0;
}

// The very first account. Only works while there are no staff at all.
export async function createFirstAdmin({ name, username, password }) {
  const u = cleanUsername(username);
  checkPassword(password);
  if (!String(name || '').trim()) throw badRequest('Please enter your name.');
  const hash = await bcrypt.hash(password, 10);
  return transaction(async (tx) => {
    await tx.run('LOCK TABLE staff IN EXCLUSIVE MODE');
    const { n } = await tx.get('SELECT count(*)::int AS n FROM staff');
    if (n > 0) throw forbidden('Setup is already done. Ask the admin to add you.');
    const staff = await tx.get(
      `INSERT INTO staff (name, username, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING *`,
      [String(name).trim(), u, hash]
    );
    await tx.run(`INSERT INTO staff_events (staff_id, target_staff_id, kind) VALUES ($1, $1, 'setup')`, [staff.id]);
    return { token: signToken(staff), staff: publicStaff(staff) };
  });
}

export async function login({ username, password }) {
  const u = String(username || '').trim().toLowerCase();
  const staff = u ? await get('SELECT * FROM staff WHERE username = $1', [u]) : null;
  // Same message either way, so nobody can find out which usernames exist.
  const ok = staff && (await bcrypt.compare(String(password || ''), staff.password_hash));
  if (!ok) throw unauthorized('Wrong username or password.');
  if (!staff.active) throw unauthorized('This account is not active. Ask the admin.');
  await run('UPDATE staff SET last_login_at = now() WHERE id = $1', [staff.id]);
  return { token: signToken(staff), staff: publicStaff(staff) };
}

export async function changeOwnPassword(staffId, { current, next }) {
  const staff = await get('SELECT * FROM staff WHERE id = $1', [staffId]);
  if (!staff || !(await bcrypt.compare(String(current || ''), staff.password_hash))) {
    throw badRequest('Your current password is wrong.');
  }
  checkPassword(next);
  await run('UPDATE staff SET password_hash = $1, updated_at = now() WHERE id = $2', [await bcrypt.hash(next, 10), staffId]);
  await run(`INSERT INTO staff_events (staff_id, target_staff_id, kind) VALUES ($1, $1, 'password')`, [staffId]);
}
