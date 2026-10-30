import { useEffect, useState } from 'react';
import { PRINTER_TEMPLATES, DEFAULT_PRINTER, normalizePrinter, getSheet } from '@engine';
import { allSheetIds, marginText, orderedSheets } from '../lib/printers.js';
import PrinterEditor from './PrinterEditor.jsx';

// Full-screen panel: choose, add and edit printers. Opens on top of any screen,
// so the work underneath is not lost.
export default function PrintersPanel({ printers, activeId, onSelect, onSave, customSheets, onClose, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing ? printers.find((p) => p.id === activeId) || null : null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  const sheetIds = allSheetIds(customSheets);

  function newFromTemplate(t) {
    const p = normalizePrinter(
      { ...DEFAULT_PRINTER, ...(t ? t.values : { name: 'New printer' }), id: `printer-${Date.now().toString(36)}`, measured: false },
      sheetIds
    );
    setAdding(false);
    setEditing({ ...p, isNew: true });
  }

  function save(p) {
    const clean = normalizePrinter(p, sheetIds);
    delete clean.isNew;
    const exists = printers.some((x) => x.id === clean.id);
    const list = exists ? printers.map((x) => (x.id === clean.id ? clean : x)) : [...printers, clean];
    onSave(list);
    if (!exists) onSelect(clean.id);
    setEditing(null);
    if (startEditing) onClose(); // opened from a tool: go straight back to it
  }

  function cancel() {
    setEditing(null);
    if (startEditing) onClose();
  }

  function remove(id) {
    const list = printers.filter((x) => x.id !== id);
    onSave(list);
    if (id === activeId) onSelect(list[0].id);
    setEditing(null);
  }

  return (
    <div className="panel" role="dialog" aria-modal="true" aria-label="Printers">
      <div className="panel-top">
        <span className="panel-title">{editing ? (editing.isNew ? 'Add a printer' : 'Edit printer') : 'Printers'}</span>
        {!editing && (
          <button type="button" className="viewer-btn" onClick={onClose}>✕ Close</button>
        )}
      </div>

      <div className="panel-body">
        {editing ? (
          <PrinterEditor
            key={editing.id}
            printer={editing}
            customSheets={customSheets}
            onSave={save}
            onCancel={cancel}
            onDelete={!editing.isNew && printers.length > 1 ? () => remove(editing.id) : null}
          />
        ) : (
          <>
            <p className="hint panel-intro">
              Choose the printer you are printing on. Its margins and sheet sizes are used for every layout, so the numbers you see are real.
            </p>
            <div className="printer-list">
              {printers.map((p) => (
                <div key={p.id} className={`printer-item ${p.id === activeId ? 'printer-on' : ''}`}>
                  <button type="button" className="printer-choose" onClick={() => onSelect(p.id)} aria-pressed={p.id === activeId}>
                    <span className="radio" aria-hidden />
                    <span className="printer-text">
                      <span className="printer-name">{p.name}</span>
                      <span className="hint">
                        {marginText(p.margins)} · {orderedSheets(p.sheets, customSheets).map((id) => getSheet(id, customSheets).label).join(', ')}
                      </span>
                      <span className="hint">
                        {p.duplex ? 'Prints both sides' : 'One side at a time'} · {p.measured ? 'Margins measured' : 'Margins not measured yet'}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setEditing(p)}>Edit</button>
                </div>
              ))}
            </div>

            {adding ? (
              <div className="card">
                <div className="field-label">Start from</div>
                <div className="template-list">
                  {PRINTER_TEMPLATES.map((t) => (
                    <button key={t.key} type="button" className="tool" onClick={() => newFromTemplate(t)}>
                      <span className="tool-text">
                        <span className="tool-name">{t.label}</span>
                        <span className="tool-desc">{marginText(t.values.margins)} · typical values, measure yours after</span>
                      </span>
                      <span className="tool-go" aria-hidden>›</span>
                    </button>
                  ))}
                  <button type="button" className="tool" onClick={() => newFromTemplate(null)}>
                    <span className="tool-text">
                      <span className="tool-name">Blank</span>
                      <span className="tool-desc">Enter everything yourself</span>
                    </span>
                    <span className="tool-go" aria-hidden>›</span>
                  </button>
                </div>
                <button type="button" className="link-btn" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="add-printer" onClick={() => setAdding(true)}>+ Add a printer</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
