import { useEffect, useState } from 'react';
import { api, staffToken } from '../lib/api.js';
import StaffLogin from './StaffLogin.jsx';
import Board from './Board.jsx';
import OrderList from './OrderList.jsx';
import OrderDetail from './OrderDetail.jsx';
import { CustomerList, CustomerDetail } from './Customers.jsx';
import StaffManager from './StaffManager.jsx';
import ShopSettings from './ShopSettings.jsx';
import ProductsEditor from './ProductsEditor.jsx';

const TABS = [
  { id: '', label: 'Board' },
  { id: 'list', label: 'All orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'products', label: 'Products', admin: true },
  { id: 'shop', label: 'Shop & prices', admin: true },
  { id: 'team', label: 'Staff', admin: true },
];

// The shop's side. #/staff = the production board, #/staff/list = every order,
// #/staff/order/12, #/staff/customers, #/staff/customer/5, and for the admin
// #/staff/products, #/staff/shop, #/staff/team.
export default function StaffApp({ path, onOpenInTool, shop }) {
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
  const customerMatch = /^customer\/(\d+)$/.exec(path);
  const admin = me.role === 'admin';
  const tab = TABS.find((t) => t.id === path && (!t.admin || admin)) || TABS[0];
  const go = (p) => {
    window.location.hash = p ? `#/staff/${p}` : '#/staff';
  };
  const openOrder = (id) => go(`order/${id}`);

  let body;
  if (orderMatch) body = <OrderDetail id={Number(orderMatch[1])} me={me} shop={shop} onBack={() => (window.history.length > 1 ? window.history.back() : go(''))} onOpenInTool={onOpenInTool} />;
  else if (customerMatch) body = <CustomerDetail id={Number(customerMatch[1])} shop={shop} onBack={() => go('customers')} onOrder={openOrder} />;
  else if (tab.id === 'list') body = <OrderList onOpen={openOrder} />;
  else if (tab.id === 'customers') body = <CustomerList shop={shop} onOpen={(id) => go(`customer/${id}`)} />;
  else if (tab.id === 'products') body = <ProductsEditor shop={shop} />;
  else if (tab.id === 'shop') body = <ShopSettings onShop={shop.set} />;
  else if (tab.id === 'team') body = <StaffManager me={me} />;
  else body = <Board me={me} shop={shop} onOpen={openOrder} />;

  return (
    <main className={`start staff ${tab.id === '' && !orderMatch && !customerMatch ? 'staff-wide' : ''}`}>
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
      {!orderMatch && !customerMatch && (
        <>
          <a className="primary as-link new-order" href="#/">+ New order for a customer</a>
          <div className="group-row" role="tablist" aria-label="Section">
            {TABS.filter((t) => !t.admin || admin).map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab.id === t.id} className={`group ${tab.id === t.id ? 'group-on' : ''}`} onClick={() => go(t.id)}>{t.label}</button>
            ))}
          </div>
        </>
      )}
      {body}
    </main>
  );
}
