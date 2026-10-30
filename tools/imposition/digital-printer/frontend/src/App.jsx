import { useEffect, useState } from 'react';
import { readPdfGeometry } from '@engine';
import { loadFiles } from './lib/loadFiles.js';
import { openPdf } from './lib/pdfRender.js';
import { store } from './lib/storage.js';
import { loadPrinters, savePrinters } from './lib/printers.js';
import Header from './components/Header.jsx';
import StartScreen from './screens/StartScreen.jsx';
import OverviewScreen from './screens/OverviewScreen.jsx';
import CardsTool from './tools/cards/CardsTool.jsx';
import CutStackTool from './tools/cutstack/CutStackTool.jsx';
import BookletTool from './tools/booklet/BookletTool.jsx';
import PerfectBoundTool from './tools/perfectbound/PerfectBoundTool.jsx';
import PrintersPanel from './printers/PrintersPanel.jsx';
import TrackScreen from './screens/TrackScreen.jsx';
import StaffApp from './staff/StaffApp.jsx';

// #/track/PH-XXXXXX = customer tracking, #/staff... = operator side, anything else = the tool.
function readRoute() {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'track' || h.startsWith('track/')) return { name: 'track', code: decodeURIComponent(h.slice(6)) };
  if (h === 'staff' || h.startsWith('staff/')) return { name: 'staff', path: h.slice(6) };
  return { name: 'main' };
}

// Screens: start (choose file) -> overview (your file + choose a tool) -> tool
// The printers panel opens on top of any screen.
export default function App() {
  const [job, setJob] = useState(null);
  const [screen, setScreen] = useState('start');
  const [tool, setTool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(() => store.get('dismissedTips', []));
  const [customSheets, setCustomSheets] = useState(() => store.get('customSheets', []));
  const [printers, setPrinters] = useState(() => loadPrinters(store.get('customSheets', [])));
  const [activeId, setActiveId] = useState(() => store.get('activePrinter', null));
  const [printersOpen, setPrintersOpen] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [fromOrder, setFromOrder] = useState(null); // { id, code, customerName, quantity, recipe } when opened from an order

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const printer = printers.find((p) => p.id === activeId) || printers[0];

  // Free the old file's memory when a new one is loaded.
  useEffect(() => {
    return () => {
      if (job) job.pdf.destroy();
    };
  }, [job]);

  // Start each screen at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, tool]);

  async function handleFiles(files) {
    setError('');
    setBusy(true);
    try {
      const loaded = await loadFiles(files);
      const geometry = await readPdfGeometry(loaded.bytes);
      const pdf = await openPdf(loaded.bytes);
      setJob({ ...loaded, geometry, pdf, id: Date.now() });
      setTool(null);
      setScreen('overview');
      setFromOrder(null);
      return true;
    } catch (e) {
      setError(e.message || 'Something went wrong reading this file.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Operator: open an order's file in its tool, set up the way the customer chose.
  async function openOrder(order, blob, fileName) {
    const file = new File([blob], fileName || `${order.code}.pdf`, { type: blob.type || 'application/pdf' });
    window.location.hash = '';
    if (!(await handleFiles([file]))) return;
    const recipe = order.recipe && order.recipe.tool ? order.recipe : { tool: order.tool };
    setFromOrder({ id: order.id, code: order.code, customerName: order.customerName, quantity: order.quantity, recipe });
    setTool(recipe.tool);
    setScreen('tool');
  }

  const tips = {
    dismissed,
    dismiss(id) {
      const next = [...dismissed, id];
      setDismissed(next);
      store.set('dismissedTips', next);
    },
    reset() {
      setDismissed([]);
      store.set('dismissedTips', []);
    },
  };

  function choosePrinter(id) {
    setActiveId(id);
    store.set('activePrinter', id);
  }

  function changePrinters(list) {
    setPrinters(list);
    savePrinters(list);
  }

  // A new custom sheet is saved and added to the printer in use.
  function addCustomSheet(sheet) {
    const list = [...customSheets, sheet];
    setCustomSheets(list);
    store.set('customSheets', list);
    changePrinters(printers.map((p) => (p.id === printer.id ? { ...p, sheets: [...p.sheets, sheet.id] } : p)));
  }

  function removeCustomSheet(id) {
    const list = customSheets.filter((s) => s.id !== id);
    setCustomSheets(list);
    store.set('customSheets', list);
    changePrinters(
      printers.map((p) => {
        const sheets = p.sheets.filter((x) => x !== id);
        const safe = sheets.length ? sheets : ['A3'];
        return { ...p, sheets: safe, defaultSheet: safe.includes(p.defaultSheet) ? p.defaultSheet : safe[0] };
      })
    );
  }

  let body;
  if (route.name === 'track') {
    body = <TrackScreen key={route.code} code={route.code} />;
  } else if (route.name === 'staff') {
    body = <StaffApp path={route.path} onOpenInTool={openOrder} />;
  } else if (!job || screen === 'start') {
    body = <StartScreen onFiles={handleFiles} busy={busy} error={error} />;
  } else if (screen === 'tool' && (tool === 'cards' || tool === 'cutstack' || tool === 'booklet' || tool === 'perfectbound')) {
    const Tool = { cards: CardsTool, cutstack: CutStackTool, booklet: BookletTool, perfectbound: PerfectBoundTool }[tool];
    body = (
      <Tool
        key={`${tool}-${job.id}`}
        job={job}
        initial={fromOrder && fromOrder.recipe.tool === tool ? fromOrder.recipe : null}
        onBack={() => setScreen('overview')}
        onFiles={handleFiles}
        busy={busy}
        loadError={error}
        tips={tips}
        customSheets={customSheets}
        onAddCustomSheet={addCustomSheet}
        onRemoveCustomSheet={removeCustomSheet}
        printers={printers}
        printer={printer}
        onPrinter={choosePrinter}
        onManagePrinters={() => setPrintersOpen('edit')}
      />
    );
  } else {
    body = (
      <OverviewScreen
        job={job}
        onOpenTool={(id) => {
          setTool(id);
          setScreen('tool');
        }}
        onFiles={handleFiles}
        busy={busy}
        error={error}
        customSheets={customSheets}
        printer={printer}
      />
    );
  }

  return (
    <div className="app">
      <Header printer={printer} onPrinters={() => setPrintersOpen('list')} />
      {fromOrder && route.name === 'main' && job && (
        <div className="order-banner">
          <span>
            Order <strong>{fromOrder.code}</strong> · {fromOrder.customerName} · {fromOrder.quantity} — customer’s settings loaded
          </span>
          <a className="link-btn" href={`#/staff/order/${fromOrder.id}`}>Back to order</a>
        </div>
      )}
      {body}
      {printersOpen && (
        <PrintersPanel
          printers={printers}
          activeId={printer.id}
          onSelect={choosePrinter}
          onSave={changePrinters}
          customSheets={customSheets}
          onClose={() => setPrintersOpen(false)}
          startEditing={printersOpen === 'edit'}
        />
      )}
    </div>
  );
}
