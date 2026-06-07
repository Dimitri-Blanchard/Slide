import { friends as friendsApi, invalidateCache } from '../api';

const listeners = new Set();
let friendIdSet = new Set();
let friendList = [];
let pendingList = [];
let ready = false;
let refreshTimer = null;
let inflightRefresh = null;
let ownerUserId = null;
let socketCleanup = null;
let dataMutatedCleanup = null;
const suppressedPendingIds = new Set();

function normalizeId(id) {
  return id == null ? '' : String(id);
}

function getPendingOtherUserId(req) {
  if (!req || typeof req !== 'object') return '';
  return normalizeId(
    req.user?.id
    ?? req.from_user_id
    ?? req.fromUserId
    ?? req.sender_id
    ?? req.senderId
  );
}

function getPendingRequestId(req) {
  return normalizeId(req?.id ?? req?.request_id ?? req?.requestId);
}

function notify() {
  const snapshot = {
    friendIds: new Set(friendIdSet),
    friends: friendList.slice(),
    pending: pendingList.slice(),
    ready,
  };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (_) {}
  });
}

function removePendingForUser(userId) {
  const id = normalizeId(userId);
  if (!id) return;
  pendingList = pendingList.filter((req) => {
    if (getPendingOtherUserId(req) === id) {
      const requestId = getPendingRequestId(req);
      if (requestId) suppressedPendingIds.add(requestId);
      return false;
    }
    return true;
  });
}

function removePendingById(requestId) {
  const id = normalizeId(requestId);
  if (!id) return;
  suppressedPendingIds.add(id);
  pendingList = pendingList.filter((req) => getPendingRequestId(req) !== id);
}

function mergePendingFromServer(freshList) {
  const fresh = Array.isArray(freshList) ? freshList : [];
  for (const id of [...suppressedPendingIds]) {
    if (!fresh.some((req) => getPendingRequestId(req) === id)) {
      suppressedPendingIds.delete(id);
    }
  }
  pendingList = fresh.filter((req) => !suppressedPendingIds.has(getPendingRequestId(req)));
}

function upsertPendingRequest(request) {
  const id = getPendingRequestId(request);
  if (!id || suppressedPendingIds.has(id)) return;
  const idx = pendingList.findIndex((req) => getPendingRequestId(req) === id);
  if (idx >= 0) {
    pendingList = pendingList.map((req, i) => (i === idx ? { ...req, ...request } : req));
  } else {
    pendingList = [...pendingList, request];
  }
}

function applyOptimistic(detail) {
  if (!detail?.action) return;
  const userId = normalizeId(detail.userId);

  if (detail.action === 'removed' || detail.action === 'blocked') {
    if (userId) {
      friendIdSet.delete(userId);
      friendList = friendList.filter((f) => normalizeId(f.id) !== userId);
      removePendingForUser(userId);
    }
    notify();
    return;
  }

  if (detail.action === 'accepted') {
    if (detail.requestId != null) removePendingById(detail.requestId);
    if (userId) removePendingForUser(userId);
    notify();
    return;
  }

  if (detail.action === 'request_declined') {
    if (detail.requestId != null) removePendingById(detail.requestId);
    else if (userId) removePendingForUser(userId);
    notify();
    return;
  }

  if (detail.action === 'request_sent' && detail.request) {
    upsertPendingRequest(detail.request);
    notify();
    return;
  }

  if (detail.action === 'request_received' && detail.request) {
    upsertPendingRequest(detail.request);
    notify();
  }
}

export function subscribeFriendsSync(callback) {
  listeners.add(callback);
  callback({
    friendIds: new Set(friendIdSet),
    friends: friendList.slice(),
    pending: pendingList.slice(),
    ready,
  });
  return () => listeners.delete(callback);
}

export function isFriend(userId) {
  return friendIdSet.has(normalizeId(userId));
}

export function isFriendRequestDuplicateError(message) {
  return /already pending|already sent|request already sent|friendship request already/i.test(message || '');
}

async function refreshFromServer() {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      invalidateCache('/friends');
      const [friendsResult, pendingResult] = await Promise.allSettled([
        friendsApi.listFresh(),
        friendsApi.pending(),
      ]);
      if (friendsResult.status === 'fulfilled') {
        friendList = Array.isArray(friendsResult.value) ? friendsResult.value : [];
        friendIdSet = new Set(
          friendList.map((f) => normalizeId(f.id)).filter(Boolean)
        );
      }
      if (pendingResult.status === 'fulfilled') {
        mergePendingFromServer(pendingResult.value);
      }
      ready = true;
      notify();
    } catch (_) {
      // Keep optimistic state on transient failures.
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshFromServer();
  }, 100);
}

export function refreshFriendsSyncNow() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  return refreshFromServer();
}

export function notifyFriendsChanged(detail) {
  applyOptimistic(detail);
  invalidateCache('/friends');
  scheduleRefresh();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('slide:friends-changed', { detail }));
  }
}

export function ensureFriendsLoaded(userId) {
  if (userId == null) {
    resetFriendsSync();
    return Promise.resolve();
  }
  if (ownerUserId !== userId) {
    resetFriendsSync();
    ownerUserId = userId;
  }
  if (ready || inflightRefresh) return inflightRefresh || Promise.resolve();
  return refreshFromServer();
}

export function resetFriendsSync() {
  ownerUserId = null;
  friendIdSet = new Set();
  friendList = [];
  pendingList = [];
  ready = false;
  suppressedPendingIds.clear();
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  inflightRefresh = null;
  if (socketCleanup) {
    socketCleanup();
    socketCleanup = null;
  }
  if (dataMutatedCleanup) {
    dataMutatedCleanup();
    dataMutatedCleanup = null;
  }
  notify();
}

function buildDetailFromSocketPayload(data, action) {
  const detail = { action };
  const userId = data?.userId ?? data?.user?.id ?? data?.fromUserId ?? data?.from_user_id;
  if (userId != null) detail.userId = userId;
  if (data?.request) detail.request = data.request;
  else if (data?.id && (data?.type || data?.user)) {
    detail.request = data;
  }
  return detail;
}

export function bindFriendsSyncSocket(socket, callbacks = {}) {
  if (socketCleanup) {
    socketCleanup();
    socketCleanup = null;
  }
  if (dataMutatedCleanup) {
    dataMutatedCleanup();
    dataMutatedCleanup = null;
  }

  if (typeof window !== 'undefined') {
    const onDataMutated = (event) => {
      const endpoint = String(event?.detail?.endpoint || '');
      if (endpoint.includes('/friends')) notifyFriendsChanged();
    };
    window.addEventListener('slide:data-mutated', onDataMutated);
    dataMutatedCleanup = () => window.removeEventListener('slide:data-mutated', onDataMutated);
  }

  if (!socket) return;

  const onFriendRequest = (data) => {
    notifyFriendsChanged(buildDetailFromSocketPayload(data, 'request_received'));
  };
  const onFriendRequestSent = (data) => {
    notifyFriendsChanged(buildDetailFromSocketPayload(data, 'request_sent'));
  };
  const onFriendRequestCancelled = (data) => {
    notifyFriendsChanged({
      action: 'request_declined',
      requestId: data?.requestId ?? data?.request_id ?? data?.id,
      userId: data?.userId ?? data?.user?.id,
    });
  };
  const onFriendAccepted = (data) => {
    notifyFriendsChanged({
      action: 'accepted',
      requestId: data?.requestId ?? data?.request_id ?? data?.request?.id,
      userId: data?.userId
        ?? data?.user?.id
        ?? data?.fromUserId
        ?? data?.from_user_id
        ?? data?.friendId
        ?? data?.friend_id,
    });
    callbacks.onFriendAccepted?.(data);
  };
  const onFriendRemoved = (data) => {
    notifyFriendsChanged({
      action: 'removed',
      userId: data?.userId ?? data?.user?.id ?? data?.friendId ?? data?.friend_id,
    });
  };

  socket.on('friend_request', onFriendRequest);
  socket.on('friend_request_sent', onFriendRequestSent);
  socket.on('friend_request_cancelled', onFriendRequestCancelled);
  socket.on('friend_accepted', onFriendAccepted);
  socket.on('friend_removed', onFriendRemoved);

  socketCleanup = () => {
    socket.off('friend_request', onFriendRequest);
    socket.off('friend_request_sent', onFriendRequestSent);
    socket.off('friend_request_cancelled', onFriendRequestCancelled);
    socket.off('friend_accepted', onFriendAccepted);
    socket.off('friend_removed', onFriendRemoved);
  };
}
