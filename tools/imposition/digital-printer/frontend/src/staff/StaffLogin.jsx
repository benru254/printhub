import { useEffect, useState } from 'react';
import { api, staffToken } from '../lib/api.js';

// Staff login. On a brand-new server (no staff yet) it creates the first admin instead.
export default function StaffLogin({ onLoggedIn }) {
  const [setup, setSetup] = useState(null); // null = checking
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api('/setup')
      .then((r) => setSetup(r.needed))
      .catch((e) => {
        setSetup(false);
        setError(e.message);
      });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = setup
        ? await api('/setup', { method: 'POST', json: form })
        : await api('/auth/login', { method: 'POST', json: { username: form.username, password: form.password } });
      staffToken.set(r.token);
      onLoggedIn(r.staff);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start">
      <a className="back-btn as-link" href="#/">‹ Home</a>
      <h1 className="start-title">{setup ? 'Create the admin account' : 'Staff login'}</h1>
      {setup && <p className="start-sub">This is a new shop server. The first account is the admin, who can add other staff.</p>}
      <form className="card" onSubmit={submit}>
        {setup && (
          <>
            <label className="field-label" htmlFor="st-name">Your name</label>
            <input id="st-name" className="num wide-select" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </>
        )}
        <label className={`field-label ${setup ? 'spaced' : ''}`} htmlFor="st-user">Username</label>
        <input id="st-user" className="num wide-select" autoComplete="username" autoCapitalize="none" required value={form.username} onChange={(e) => set({ username: e.target.value })} />
        <label className="field-label spaced" htmlFor="st-pass">Password{setup ? ' (8 or more characters)' : ''}</label>
        <input id="st-pass" className="num wide-select" type="password" autoComplete={setup ? 'new-password' : 'current-password'} required value={form.password} onChange={(e) => set({ password: e.target.value })} />
        <button type="submit" className="primary spaced-top" disabled={busy || setup === null}>
          {busy ? 'Please wait…' : setup ? 'Create admin and log in' : 'Log in'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
