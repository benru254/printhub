// Printing a paper (job ticket, receipt). The paper is drawn into #print-root, a box next
// to the app that only shows on paper; the app itself is hidden while printing.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Renders `children` for the printer and opens the print window once. onDone runs when it closes.
export function PrintSheet({ children, onDone }) {
  useEffect(() => {
    const done = () => onDone && onDone();
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 80); // let the paper draw first
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const host = document.getElementById('print-root');
  return host ? createPortal(children, host) : null;
}
