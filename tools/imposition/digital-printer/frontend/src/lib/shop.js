// The shop's public settings (name, WhatsApp, prices, printers) from the server.
// The last answer is kept on the device, so prices still show with no internet.
import { useEffect, useState } from 'react';
import { DEFAULT_PRICE_LIST } from '@engine';
import { api } from './api.js';
import { store } from './storage.js';

const EMPTY = { shop: { name: 'PrintHub', whatsapp: '', turnaroundDays: 2 }, priceList: DEFAULT_PRICE_LIST, printers: [], customSheets: [] };

export function useShop() {
  const [data, setData] = useState(() => ({ ...EMPTY, ...store.get('shopCache', {}) }));
  const [online, setOnline] = useState(false);

  function load() {
    return api('/shop')
      .then((r) => {
        setData({ ...EMPTY, ...r });
        store.set('shopCache', r);
        setOnline(true);
      })
      .catch(() => setOnline(false));
  }

  useEffect(() => {
    load();
  }, []);

  return { ...data, online, reload: load, set: (r) => (setData({ ...EMPTY, ...r }), store.set('shopCache', r)) };
}
