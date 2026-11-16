import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { customer, rememberKeys } from '../lib/customer.js';
import { store } from '../lib/storage.js';

// This customer's orders from the server (when this phone has ordered before).
// Returns { data: { customer, orders } | null, loading, reload }.
export function useMyOrders() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(() => !!customer.token());

  const reload = useCallback(() => {
    if (!customer.token()) {
      setData(null);
      setLoading(false);
      return Promise.resolve(null);
    }
    return api('/me/orders', { customer: true })
      .then((r) => {
        rememberKeys(r.orders);
        setData(r);
        return r;
      })
      .catch((e) => {
        if (e.status === 401) store.set('customerToken', null); // the token ran out: ask for phone + code again
        setData(null);
        return null;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload };
}
