import { useEffect, useState } from 'react';
import { api, formatWhen } from '../lib/api.js';

// Admin only: add staff, switch accounts off, reset passwords.
export default function StaffManager({ me }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'operator' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = () => api('/staff', { auth: true }).then((r) => setList(r.staff)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function run(fn, ok) {
    setError('');
    setDone('');
    try {
      await fn();
      setDone(ok);
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  return (
    <div className="staff-list">
      <div className="card">
        <div className="field-label">Staff</div>
        <ul className="file-rows">
          {list.map((s) => (
            <li key={s.id} className={`file-row ${s.active ? '' : 'row-off'}`}>
              <span>
                <strong>{s.name}</strong>
                <span className="hint"> · {s.username} · {s.role}{s.active ? '' : ' · switched off'}{s.lastLoginAt ? ` · last in ${formatWhen(s.lastLoginAt)}` : ''}</span>
              </span>
              {s.id !== me.id && (
                <span className="row-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => run(() => api(`/staff/${s.id}`, { method: 'PATCH', auth: true, json: { active: !s.active } }), s.active ? `${s.name} switched off.` : `${s.name} switched on.`)}
                  >
                    {s.active ? 'Switch off' : 'Switch on'}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      const password = window.prompt(`New password for ${s.name} (8 or more characters):`);
                      if (password) run(() => api(`/staff/${s.id}`, { method: 'PATCH', auth: true, json: { password } }), `Password changed for ${s.name}.`);
                    }}
                  >
                    New password
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api('/staff', { method: 'POST', auth: true, json: form }), `${form.name} added. Give them their username and password.`).then(
            (ok) => ok && setForm({ name: '', username: '', password: '', role: 'operator' })
          );
        }}
      >
        <div className="field-label">Add a staff member</div>
        <input className="num wide-select spaced-top" placeholder="Name" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <input className="num wide-select spaced-top" placeholder="Username (no spaces)" autoCapitalize="none" required value={form.username} onChange={(e) => set({ username: e.target.value })} />
        <input className="num wide-select spaced-top" type="text" placeholder="Password (8 or more characters)" autoComplete="new-password" required value={form.password} onChange={(e) => set({ password: e.target.value })} />
        <select className="select wide-select spaced-top" value={form.role} onChange={(e) => set({ role: e.target.value })}>
          <option value="operator">Operator: orders only</option>
          <option value="admin">Admin: orders and staff</option>
        </select>
        <button type="submit" className="primary spaced-top">Add staff member</button>
      </form>
      {error && <p className="error">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
    </div>
  );
}
