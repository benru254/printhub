// The shop's public settings (name, WhatsApp, prices, printers) from the server.
// The last answer is kept on the device, so prices still show with no internet.
import { useEffect, useState } from 'react';
import { DEFAULT_PRICE_LIST, DEFAULT_CATALOGUE } from '@engine';
import { api } from './api.js';
import { store } from './storage.js';

const NO_SHOP = { name: 'PrintHub', whatsapp: '', turnaroundDays: 2, address: '', hours: '', pin: '', closedDays: [0], pay: { method: 'none', number: '', account: '', name: '', depositPct: 50 } };
const EMPTY = { shop: NO_SHOP, priceList: DEFAULT_PRICE_LIST, catalogue: DEFAULT_CATALOGUE, printers: [], customSheets: [] };
// An answer kept from before a new part existed (or with no server at all) still has every part.
const whole = (r) => ({ ...EMPTY, ...r, shop: { ...NO_SHOP, ...(r && r.shop), pay: { ...NO_SHOP.pay, ...(r && r.shop && r.shop.pay) } } });

export function useShop() {
  const [data, setData] = useState(() => whole(store.get('shopCache', {})));
  const [online, setOnline] = useState(false);

  function load() {
    return api('/shop')
      .then((r) => {
        setData(whole(r));
        store.set('shopCache', r);
        setOnline(true);
      })
      .catch(() => setOnline(false));
  }

  useEffect(() => {
    load();
  }, []);

  return { ...data, online, reload: load, set: (r) => (setData(whole(r)), store.set('shopCache', r)) };
}
