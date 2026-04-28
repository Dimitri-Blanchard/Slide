/**
 * File d'attente des messages en mode hors ligne.
 * Stocke les messages en IndexedDB pour persistance.
 * Les messages sont envoyés automatiquement à la reconnexion.
 */

const DB_NAME = 'slide_offline_queue';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
  return dbPromise;
}

/** Génère un ID unique pour un message en attente */
export function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Détecte si une erreur est due à un problème réseau (connexion coupée, serveur injoignable).
 */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.isNetworkError === true) return true;
  const st = err.status;
  if (st === 502 || st === 503 || st === 504 || st === 408) return true;
  const msg = (err.message || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  return (
    (name === 'typeerror' && (
      msg.includes('fetch') ||
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('load failed')
    )) ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('joindre le serveur') ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ERR_NETWORK'
  );
}

/**
 * Ajoute un message à la file d'attente.
 * @param {Object} item - { context: 'dm'|'channel', targetId, payload: { content, type, replyToId }, tempId? }
 *   tempId optionnel : si fourni, utilisé pour l'événement de succès. Sinon généré.
 */
export async function addToQueue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      ...item,
      tempId: item.tempId || generateTempId(),
      createdAt: Date.now(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Récupère tous les messages en attente.
 */
export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Supprime un message de la file.
 */
export async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Drop all queued sends (e.g. account switch) so another user never posts another account's drafts. */
export async function clearAllQueuedMessages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
