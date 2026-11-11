// Keeps the last file on this device (IndexedDB), so a phone that reloads the page or
// closes the browser does not lose the customer's work. Only ever one file is kept.
const DB = 'printhub';
const STORE = 'jobs';
const KEY = 'last';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// loaded = what loadFiles() returns: { name, sourceType, fileSize, fileCount, bytes, imageInfo }
export function saveLastJob(loaded) {
  return run('readwrite', (s) => s.put({ ...loaded, savedAt: Date.now() }, KEY)).catch(() => {});
}

export function readLastJob() {
  return run('readonly', (s) => s.get(KEY)).catch(() => null);
}

export function clearLastJob() {
  return run('readwrite', (s) => s.delete(KEY)).catch(() => {});
}
