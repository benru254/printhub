// Small warning labels on an order, for the board and the list: what is special about it.
// tone: 'warn' (needs attention) | 'info'
export function orderBadges(o) {
  const out = [];
  const open = !['collected', 'cancelled'].includes(o.status);
  if (o.claims > 0) out.push({ text: 'Says they paid — check', tone: 'warn' });
  if (o.proofState === 'changes' && open) out.push({ text: 'Change asked', tone: 'warn' });
  if (o.artwork === 'later' && open) out.push({ text: 'No design yet', tone: 'warn' });
  if (o.artwork === 'design' && ['new', 'checking'].includes(o.status)) out.push({ text: 'Design needed', tone: 'warn' });
  if (o.quote && o.quote.speed === 'express' && open) out.push({ text: 'Express', tone: 'warn' });
  if (o.total > 0 && o.paid <= 0 && open) out.push({ text: 'Not paid', tone: 'info' });
  if (o.delivery === 'deliver') out.push({ text: 'Deliver', tone: 'info' });
  if (o.quote && o.quote.route === 'offset') out.push({ text: 'Offset', tone: 'info' });
  if (o.source === 'reorder') out.push({ text: 'Repeat', tone: 'info' });
  if (o.source === 'counter') out.push({ text: 'Counter', tone: 'info' });
  return out;
}
