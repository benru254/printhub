// Working days. "Ready in 2 days" must not land on a day the shop is closed.
// closedDays: days of the week the shop is closed, 0 = Sunday ... 6 = Saturday.

export function cleanClosedDays(value, fallback = [0]) {
  if (!Array.isArray(value)) return fallback;
  const days = [...new Set(value.map((d) => Math.floor(Number(d))).filter((d) => d >= 0 && d <= 6))].sort();
  return days.length >= 7 ? fallback : days; // closed every day makes no sense
}

// The day an order is ready: `days` working days after `from`. 0 = the same day
// (or the next open day when the shop is closed that day).
export function readyDate(from, days, closedDays = [0]) {
  const closed = new Set(cleanClosedDays(closedDays));
  const d = new Date(from);
  d.setHours(17, 0, 0, 0); // ready by the end of the day
  while (closed.has(d.getDay())) d.setDate(d.getDate() + 1);
  let left = Math.max(0, Math.floor(Number(days)) || 0);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!closed.has(d.getDay())) left -= 1;
  }
  return d;
}

// "today", "tomorrow", "Tuesday 17 Nov"
export function dayName(date, now = new Date()) {
  const a = new Date(date);
  const diff = Math.round((new Date(a).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return a.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
