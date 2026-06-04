const KEY_VERSION = 'v1';
const PROTOCOL_VERSION = 1;
export const LOCAL_PRIVATE_CHATS_CHANGED_EVENT = 'slide:local-private-chats-changed';

const enc = new TextEncoder();
const dec = new TextDecoder();

function isElectronRuntime() {
  return typeof window !== 'undefined' && !!window.electron?.isElectron;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function keyPrefix(userId) {
  return `slide_local_private_${KEY_VERSION}_u${userId}`;
}

function keyPairStorageKey(userId) {
  return `${keyPrefix(userId)}_ecdh_keypair`;
}

function peerPublicStorageKey(currentUserId, peerUserId) {
  return `${keyPrefix(currentUserId)}_peer_${peerUserId}_public_key`;
}

function messagesStorageKey(currentUserId, peerUserId) {
  const ids = [String(currentUserId), String(peerUserId)].sort().join('_');
  return `${keyPrefix(currentUserId)}_messages_${ids}`;
}

function chatsStorageKey(currentUserId) {
  return `${keyPrefix(currentUserId)}_chats`;
}

async function secureGet(key) {
  if (window.electron?.secureGet) {
    const value = await window.electron.secureGet(key);
    return value || null;
  }
  return localStorage.getItem(key);
}

async function secureSet(key, value) {
  if (window.electron?.secureSet) {
    await window.electron.secureSet(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function getOrCreateLocalPrivateIdentity(currentUserId) {
  if (!isElectronRuntime()) {
    throw new Error('Local private chat is only available in the desktop app.');
  }
  if (!crypto?.subtle) {
    throw new Error('WebCrypto is not available.');
  }

  const storageKey = keyPairStorageKey(currentUserId);
  const stored = await secureGet(storageKey);
  if (stored) {
    const parsed = JSON.parse(stored);
    const privateKey = await importPrivateKey(parsed.privateKey);
    return { privateKey, publicJwk: parsed.publicKey };
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.publicKey),
  ]);
  await secureSet(storageKey, JSON.stringify({ privateKey: privateJwk, publicKey: publicJwk }));
  return { privateKey: pair.privateKey, publicJwk };
}

export function isLocalPrivateChatAvailable() {
  return isElectronRuntime() && !!crypto?.subtle;
}

export function getStoredPeerPublicKey(currentUserId, peerUserId) {
  try {
    const raw = localStorage.getItem(peerPublicStorageKey(currentUserId, peerUserId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storePeerPublicKey(currentUserId, peerUserId, publicJwk) {
  if (!publicJwk) return;
  localStorage.setItem(peerPublicStorageKey(currentUserId, peerUserId), JSON.stringify(publicJwk));
}

async function deriveAesKey(privateKey, peerPublicJwk) {
  const publicKey = await importPublicKey(peerPublicJwk);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptLocalPrivatePayload(privateKey, peerPublicJwk, payload) {
  const key = await deriveAesKey(privateKey, peerPublicJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(payload))
  );
  return {
    v: PROTOCOL_VERSION,
    alg: 'ECDH-P256-AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptLocalPrivatePayload(privateKey, peerPublicJwk, encryptedPayload) {
  const key = await deriveAesKey(privateKey, peerPublicJwk);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encryptedPayload.iv) },
    key,
    base64ToBytes(encryptedPayload.ciphertext)
  );
  return JSON.parse(dec.decode(plaintext));
}

export function appendEncryptedLocalPrivateMessage(currentUserId, peerUserId, record) {
  const storageKey = messagesStorageKey(currentUserId, peerUserId);
  let records = [];
  try {
    records = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    records = [];
  }
  if (records.some((item) => item.id === record.id)) return records;
  const next = [...records, record].slice(-500);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

function emitLocalPrivateChatsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_PRIVATE_CHATS_CHANGED_EVENT));
}

export function getEncryptedLocalPrivateMessages(currentUserId, peerUserId) {
  try {
    const records = JSON.parse(localStorage.getItem(messagesStorageKey(currentUserId, peerUserId)) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function makeLocalPrivateConversationId(peerUserId) {
  return `local_private_${peerUserId}`;
}

export function getLocalPrivateChats(currentUserId) {
  try {
    const chats = JSON.parse(localStorage.getItem(chatsStorageKey(currentUserId)) || '[]');
    return Array.isArray(chats) ? chats : [];
  } catch {
    return [];
  }
}

export function upsertLocalPrivateChat(currentUserId, peerUser, patch = {}) {
  if (!currentUserId || !peerUser?.id) return null;
  const now = new Date().toISOString();
  const peerId = String(peerUser.id);
  const chats = getLocalPrivateChats(currentUserId);
  const existing = chats.find((chat) => String(chat.peerUser?.id) === peerId);
  const nextChat = {
    id: makeLocalPrivateConversationId(peerId),
    peerUser: {
      ...(existing?.peerUser || {}),
      ...peerUser,
      id: peerUser.id,
    },
    created_at: existing?.created_at || now,
    updated_at: patch.updated_at || patch.last_message_at || existing?.updated_at || now,
    last_message_at: patch.last_message_at || existing?.last_message_at || now,
    last_message_preview: patch.last_message_preview ?? existing?.last_message_preview ?? 'Invitation privée locale',
    unread_count: patch.unread_count ?? existing?.unread_count ?? 0,
    accepted: patch.accepted ?? existing?.accepted ?? false,
  };
  const next = [
    nextChat,
    ...chats.filter((chat) => String(chat.peerUser?.id) !== peerId),
  ].sort((a, b) => new Date(b.last_message_at || b.updated_at || b.created_at) - new Date(a.last_message_at || a.updated_at || a.created_at));
  localStorage.setItem(chatsStorageKey(currentUserId), JSON.stringify(next));
  emitLocalPrivateChatsChanged();
  return nextChat;
}

export function removeLocalPrivateChat(currentUserId, peerUserId) {
  if (!currentUserId || !peerUserId) return;
  const peerId = String(peerUserId);
  const next = getLocalPrivateChats(currentUserId).filter((chat) => String(chat.peerUser?.id) !== peerId);
  localStorage.setItem(chatsStorageKey(currentUserId), JSON.stringify(next));
  emitLocalPrivateChatsChanged();
}

export function toLocalPrivateConversation(chat) {
  if (!chat?.peerUser?.id) return null;
  return {
    conversation_id: chat.id || makeLocalPrivateConversationId(chat.peerUser.id),
    is_local_private: true,
    local_private_peer_id: String(chat.peerUser.id),
    participants: [chat.peerUser],
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    last_message_at: chat.last_message_at,
    last_message_preview: chat.last_message_preview,
    unread_count: chat.unread_count || 0,
    accepted: !!chat.accepted,
  };
}

export function makeLocalPrivateRoute(userId) {
  return `/channels/@me/private-local/${encodeURIComponent(userId)}`;
}
