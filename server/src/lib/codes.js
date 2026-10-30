// Order codes the customer can read out on the phone: PH-7K4QX2
// No 0/O, 1/I/L, so nothing is misread.
import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeOrderCode(length = 6) {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `PH-${s}`;
}

// Accepts "ph 7k4qx2", "PH-7K4QX2", "7K4QX2" -> "PH-7K4QX2"
export function cleanOrderCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = s.startsWith('PH') ? s.slice(2) : s;
  return body ? `PH-${body}` : '';
}
