// M-Pesa confirmation messages. Customers paste the whole SMS ("TKA1B2C3D4 Confirmed.
// Ksh1,500.00 sent to PRINT SHOP...") far more often than they type the code, so we read
// the code and the amount out of whatever they paste.

export const MPESA_CODE = /^[A-Z0-9]{8,12}$/;

export function parseMpesa(text) {
  const raw = String(text || '').trim();
  const upper = raw.toUpperCase();
  const tight = upper.replace(/\s+/g, '');
  let code = null;
  if (MPESA_CODE.test(tight) && /\d/.test(tight) && /[A-Z]/.test(tight)) code = tight;
  else {
    // In a message: ten letters and digits, starting with a letter, with at least one digit.
    const m = upper.match(/\b(?=[A-Z0-9]*\d)[A-Z][A-Z0-9]{9}\b/);
    if (m) code = m[0];
  }
  const a = upper.match(/KSH\.?\s*([\d,]+(?:\.\d{1,2})?)/);
  const amount = a ? Number(a[1].replace(/,/g, '')) : null;
  return { code, amount: Number.isFinite(amount) && amount > 0 ? amount : null };
}
