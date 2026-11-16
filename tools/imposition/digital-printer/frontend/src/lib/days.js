// Dates and counts in the words people use.

// unitText('banners', 1) -> 'banner'
export const unitText = (unit, n) => (Number(n) === 1 && /[^s]s$/.test(unit) ? unit.slice(0, -1) : unit);

// "today", "tomorrow", "Tue 17 Nov"
export function dayText(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// For the shop: { text: 'Due today' | 'Due tomorrow' | 'Due in 3 days' | '2 days late', late }
export function dueText(iso) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, late: true, days };
  return { text: days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`, late: false, days };
}

// "just now", "3 hours ago", "5 days ago", "2 months ago"
export function agoText(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min)) return '';
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  if (min < 1440) return `${Math.round(min / 60)} hours ago`;
  if (min < 86400) return `${Math.round(min / 1440)} days ago`;
  return `${Math.round(min / 43200)} months ago`;
}
