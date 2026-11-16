// Copies text (a till number, a link). Works on plain http too, where the modern way is blocked.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
