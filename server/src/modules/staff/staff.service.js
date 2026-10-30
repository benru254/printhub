// Staff accounts (admin only). Every change is written to staff_events.
import bcrypt from 'bcryptjs';
import { all, get, transaction } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { checkPassword, cleanUsername, publicStaff } from '../auth/auth.service.js';

const ROLES = ['admin', 'operator'];

export async function listStaff() {
  const rows = await all('SELECT * FROM staff ORDER BY active DESC, name');
  return rows.map((s) => ({ ...publicStaff(s), lastLoginAt: s.last_login_at, createdAt: s.created_at }));
}

export async function createStaff(adminId, { name, username, password, role = 'operator' }) {
  if (!String(name || '').trim()) throw badRequest('Please enter a name.');
  const u = cleanUsername(username);
  checkPassword(password);
  if (!ROLES.includes(role)) throw badRequest('Role must be admin or operator.');
  if (await get('SELECT 1 FROM staff WHERE username = $1', [u])) throw badRequest('That username is already taken.');
  const hash = await bcrypt.hash(password, 10);
  return transaction(async (tx) => {
    const s = await tx.get(
      'INSERT INTO staff (name, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [String(name).trim(), u, hash, role]
    );
    await tx.run(`INSERT INTO staff_events (staff_id, target_staff_id, kind, data) VALUES ($1, $2, 'created', $3)`, [adminId, s.id, { role }]);
    return publicStaff(s);
  });
}

// patch: { name?, role?, active?, password? }
export async function updateStaff(adminId, id, patch = {}) {
  const s = await get('SELECT * FROM staff WHERE id = $1', [id]);
  if (!s) throw notFound('Staff member not found.');
  const sets = [];
  const params = [];
  const changed = {};
  const set = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw badRequest('Please enter a name.');
    set('name', name);
    changed.name = name;
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw badRequest('Role must be admin or operator.');
    set('role', patch.role);
    changed.role = patch.role;
  }
  if (patch.active !== undefined) {
    set('active', !!patch.active);
    changed.active = !!patch.active;
  }
  if (patch.password !== undefined) {
    checkPassword(patch.password);
    set('password_hash', await bcrypt.hash(patch.password, 10));
    changed.password = 'reset';
  }
  if (!sets.length) return publicStaff(s);

  // Never leave the shop without an active admin.
  const losingAdmin = s.role === 'admin' && s.active && (changed.role === 'operator' || changed.active === false);
  if (losingAdmin) {
    const { n } = await get(`SELECT count(*)::int AS n FROM staff WHERE role = 'admin' AND active AND id <> $1`, [id]);
    if (n === 0) throw badRequest('There must always be at least one active admin.');
  }

  return transaction(async (tx) => {
    params.push(id);
    const row = await tx.get(`UPDATE staff SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
    await tx.run(`INSERT INTO staff_events (staff_id, target_staff_id, kind, data) VALUES ($1, $2, 'updated', $3)`, [adminId, id, changed]);
    return publicStaff(row);
  });
}
