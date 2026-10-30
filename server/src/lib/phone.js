// Phone numbers are stored in one form: +<country code><number>, digits only.
//   0712 345 678  -> +254712345678   (DEFAULT_COUNTRY_CODE = 254)
//   712345678     -> +254712345678
//   254712345678  -> +254712345678
//   +44 7700 900123 -> +447700900123
import { config } from '../config.js';

export function normalizePhone(input, countryCode = config.countryCode) {
  const raw = String(input || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1);
  } else if (!digits.startsWith(countryCode) && digits.length <= 9) {
    digits = countryCode + digits;
  }
  if (digits.length < 9 || digits.length > 15) return null;
  return `+${digits}`;
}

// For screens: +254 712 345 678
export function prettyPhone(phone) {
  const m = /^\+(\d{3})(\d{3})(\d{3})(\d+)$/.exec(phone || '');
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
