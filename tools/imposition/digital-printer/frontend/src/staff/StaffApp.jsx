import { useEffect, useState } from 'react';
import { api, staffToken } from '../lib/api.js';
import Segmented from '../components/Segmented.jsx';
import StaffLogin from './StaffLogin.jsx';
import OrderList from './OrderList.jsx';
import OrderDetail from './OrderDetail.jsx';
import StaffManager from './StaffManager.jsx';
import ShopSettings from './ShopSettings.jsx';

// The operator side: #/staff (orders), #/staff/order/12, #/staff/team (admin).
export default function StaffApp({ path, onOpenInTool }) {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(() => !!staffToken.get());

  useEffect(() => {
    if (!staffToken.get()) return;
    api('/auth/me', { auth: true })
      .then((r) => setMe(r.staff))
      .catch(() => staffToken.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <main className="start"><p className="hint">Loading…</p></main>;
  if (!me) return <StaffLogin onLoggedIn={setMe} />;

  const orderMatch = /^order\/(\d+)$/.exec(path);
  const section = path === 'team' || path === 'shop' ? path : 'orders';
  const go = (p) => {
    window.location.hash = p ? `#/staff/${p}` : '#/staff';
  };

  return (
    <main className="start staff">
      <div className="staff-bar">
        <span className="staff-me">{me.name} · {me.role}</span>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            staffToken.clear();
            setMe(null);
          }}
        >
          Log out
        </button>
      </div>
      {me.role === 'admin' && !orderMatch && (
        <Segmented
          options={[{ value: 'orders', label: 'Orders' }, { value: 'shop', label: 'Shop & prices' }, { value: 'team', label: 'Staff' }]}
          value={section}
          onChange={(v) => go(v === 'orders' ? '' : v)}
          label="Section"
        />
      )}
      {orderMatch ? (
        <OrderDetail id={Number(orderMatch[1])} me={me} onBack={() => go('')} onOpenInTool={onOpenInTool} />
      ) : section === 'team' && me.role === 'admin' ? (
        <StaffManager me={me} />
      ) : section === 'shop' && me.role === 'admin' ? (
        <ShopSettings />
      ) : (
        <OrderList onOpen={(id) => go(`order/${id}`)} />
      )}
    </main>
  );
}
