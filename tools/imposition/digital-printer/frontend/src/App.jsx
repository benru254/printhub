import { lazy, Suspense, useEffect, useState } from 'react';
import { readPdfGeometry } from '@engine';
import { loadFiles } from './lib/loadFiles.js';
import { openPdf } from './lib/pdfRender.js';
import { store } from './lib/storage.js';
import { loadPrinters, savePrinters } from './lib/printers.js';
import Header from './components/Header.jsx';
import StartScreen from './screens/StartScreen.jsx';
import OverviewScreen from './screens/OverviewScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useShop } from './lib/shop.js';
import { startsPro, PRO_ONLY_NOTES } from './lib/mode.js';
import { staffToken } from './lib/api.js';
import { saveLastJob, readLastJob, clearLastJob } from './lib/jobStore.js';

// Loaded only when opened, so the first screen appears faster on a phone.
const TOOLS = {
  cards: lazy(() => import('./tools/cards/CardsTool.jsx')),
  cutstack: lazy(() => import('./tools/cutstack/CutStackTool.jsx')),
  booklet: lazy(() => import('./tools/booklet/BookletTool.jsx')),
  perfectbound: lazy(() => import('./tools/perfectbound/PerfectBoundTool.jsx')),
};
const PrintersPanel = lazy(() => import('./printers/PrintersPanel.jsx'));
const TrackScreen = lazy(() => import('./screens/TrackScreen.jsx'));
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));

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
  const [pro, setPro] = useState(startsPro); // Simple (customers) or Pro (the shop): see lib/mode.js
  const [resume, setResume] = useState(null); // the file from last time, if the phone kept it
  const shop = useShop();

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      if (staffToken.get()) setPro(true); // staff always work in Pro
    };
    // The phone's Back button moves between our screens instead of leaving the app.
    const onPop = (e) => {
      setRoute(readRoute());
      setScreen((e.state && e.state.screen) || 'start');
      setTool((e.state && e.state.tool) || null);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onPop);
    readLastJob().then((saved) => saved && saved.bytes && setResume(saved));
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  function go(nextScreen, nextTool = null) {
    setScreen(nextScreen);
    setTool(nextTool);
    // Always lands on the tool side of the app (leaving #/staff or #/track if we were there).
    window.history.pushState({ screen: nextScreen, tool: nextTool }, '', '#/');
    setRoute({ name: 'main' });
  }

  function togglePro() {
    store.set('proMode', !pro);
    setPro(!pro);
  }

  // Customers (Simple) plan on the shop's own printer when the shop has published it,
  // so "how many fit on a sheet" and the price are the real ones.
  const usingShop = !pro && shop.printers.length > 0;
  const shownPrinters = usingShop ? shop.printers : printers;
  const shownSheets = usingShop ? shop.customSheets : customSheets;
  const printer = shownPrinters.find((p) => p.id === activeId) || shownPrinters[0];

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

  // files = picked files, or { saved } = the file kept from last time.
  async function handleFiles(files, { keep = true, then = 'overview', thenTool = null } = {}) {
    setError('');
    setBusy(true);
    try {
      const loaded = files.saved || (await loadFiles(files));
      const geometry = await readPdfGeometry(loaded.bytes);
      const pdf = await openPdf(loaded.bytes);
      setJob({ ...loaded, geometry, pdf, id: Date.now() });
      setFromOrder(null);
      go(then, thenTool);
      if (keep && !files.saved) saveLastJob(loaded).then(() => setResume(loaded));
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
    const recipe = order.recipe && order.recipe.tool ? order.recipe : { tool: order.tool };
    // A customer's file is not kept as "your last file" on the shop computer.
    if (!(await handleFiles([file], { keep: false, then: 'tool', thenTool: recipe.tool }))) return;
    setFromOrder({ id: order.id, code: order.code, customerName: order.customerName, quantity: order.quantity, recipe });
  }

  const tips = {
    // In Simple, tips meant for the person running the printer are never shown.
    dismissed: pro ? dismissed : [...dismissed, ...PRO_ONLY_NOTES],
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
    body = (
      <StartScreen
        onFiles={handleFiles}
        busy={busy}
        error={error}
        shop={shop.shop}
        resume={resume}
        onResume={() => handleFiles({ saved: resume })}
        onForget={() => clearLastJob().then(() => setResume(null))}
      />
    );
  } else if (screen === 'tool' && TOOLS[tool]) {
    const Tool = TOOLS[tool];
    body = (
      <Tool
        key={`${tool}-${job.id}`}
        job={job}
        initial={fromOrder && fromOrder.recipe.tool === tool ? fromOrder.recipe : null}
        ctx={{ pro, shop, order: fromOrder && fromOrder.recipe.tool === tool ? fromOrder : null }}
        onBack={() => window.history.back()}
        onFiles={handleFiles}
        busy={busy}
        loadError={error}
        tips={tips}
        customSheets={shownSheets}
        onAddCustomSheet={addCustomSheet}
        onRemoveCustomSheet={removeCustomSheet}
        printers={shownPrinters}
        printer={printer}
        onPrinter={choosePrinter}
        onManagePrinters={() => setPrintersOpen('edit')}
      />
    );
  } else {
    body = (
      <OverviewScreen
        job={job}
        onOpenTool={(id) => go('tool', id)}
        onFiles={handleFiles}
        busy={busy}
        error={error}
        customSheets={shownSheets}
        printer={printer}
      />
    );
  }

  return (
    <div className="app">
      <Header printer={pro ? printer : null} onPrinters={() => setPrintersOpen('list')} pro={pro} onTogglePro={togglePro} shopName={shop.shop.name} />
      {fromOrder && route.name === 'main' && job && (
        <div className="order-banner">
          <span>
            Order <strong>{fromOrder.code}</strong> · {fromOrder.customerName} · {fromOrder.quantity} — customer’s settings loaded
          </span>
          <a className="link-btn" href={`#/staff/order/${fromOrder.id}`}>Back to order</a>
        </div>
      )}
      <ErrorBoundary key={`${route.name}-${screen}-${tool}`}>
        <Suspense fallback={<main className="start"><p className="hint">Loading…</p></main>}>{body}</Suspense>
      </ErrorBoundary>
      {printersOpen && pro && (
        <Suspense fallback={null}>
        <PrintersPanel
          printers={printers}
          activeId={printer.id}
          onSelect={choosePrinter}
          onSave={changePrinters}
          customSheets={customSheets}
          onClose={() => setPrintersOpen(false)}
          startEditing={printersOpen === 'edit'}
        />
        </Suspense>
      )}
    </div>
  );
}
