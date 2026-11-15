// WhatsApp is where the shop and its customers already talk. These open a chat with the
// words ready typed; the person just presses send. (No WhatsApp account is linked to the app.)
import { formatMoney } from '@engine';

export const waLink = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

// Ready-made messages from the shop to a customer. order = staff order, link = their tracking link.
export function shopMessages(order, link, shopName) {
  const hi = `Hello ${first(order.customerName)},`;
  const what = `${order.title} (${order.quantity})`;
  const bal = order.money ? order.money.balance : 0;
  const list = [
    { id: 'proof', label: 'Proof is ready', text: `${hi} the proof of your ${what} is ready. Please check it and tap Approve so we can print: ${link}` },
    { id: 'ready', label: 'Ready to collect', text: `${hi} your ${what} is ready${order.delivery === 'deliver' ? ' and will be delivered' : ' to collect'}.${bal > 0 ? ` Balance to pay: ${formatMoney(bal)}.` : ''} Order ${order.code}. ${shopName}` },
    { id: 'design', label: 'Send your design', text: `${hi} we are ready to start your ${what}. Please send your design here: ${link}` },
    { id: 'pay', label: 'Payment reminder', text: `${hi} a reminder for order ${order.code} (${what}): ${formatMoney(Math.max(0, order.money && order.money.depositDue > 0 ? order.money.depositDue : bal))} to pay. You can pay and tell us here: ${link}` },
    { id: 'track', label: 'Tracking link', text: `${hi} follow your order ${order.code} here: ${link}` },
  ];
  // The one that fits the order right now comes first.
  const now = order.status === 'proof' ? 'proof' : order.status === 'ready' ? 'ready' : order.artwork === 'later' ? 'design' : bal > 0 ? 'pay' : 'track';
  return [...list.filter((m) => m.id === now), ...list.filter((m) => m.id !== now)];
}

// "Time to restock?" for a customer who has not ordered for a while.
export function restockMessage(customerName, last, shopUrl, shopName) {
  return `Hello ${first(customerName)}, it has been a while since your ${last ? last.title.toLowerCase() : 'last order'}. Need more? Order again in one tap: ${shopUrl} — ${shopName}`;
}
