import { formatMoney } from '@engine';

// What the customer should do about an order right now, if anything. o = a row of "my orders".
export function needsYou(o) {
  if (o.proofState === 'sent') return 'Check and approve your proof';
  if (o.status === 'needs_customer') return 'The shop needs something from you';
  if (o.artwork === 'later' && !['collected', 'cancelled'].includes(o.status)) return 'Send your design';
  if (o.status === 'ready') return o.total - o.paid > 0 ? `Ready — ${formatMoney(o.total - o.paid)} to pay` : 'Ready to collect';
  return '';
}
