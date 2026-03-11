import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { auth as authApi, setAuthErrorHandler, invalidateCache } from '../api';
import { resetRateLimit } from '../utils/security';
import { getToken, setToken as persistToken, clearToken as persistClearToken, getOrCreateDeviceId, getDeviceName, getAccounts, addAccount as storageAddAccount, removeAccount as storageRemoveAccount, getAccountToken, getRefreshToken, setRefreshToken, clearRefreshToken } from '../utils/tokenStorage';

const AuthContext = createContext(null);

// ═══════════════════════════════════════════════════════════
// CONSOLE LOGGING FOR USER SYSTEM (developer debugging - no sensitive data)
// ═══════════════════════════════════════════════════════════
const AUTH_LOG_PREFIX = '[Auth]';
function authLog(level, action, details = {}) {
  const safe = { ...details };
  const msg = `${AUTH_LOG_PREFIX} ${action}`;
  if (level === 'info') console.info(msg, safe);
  else if (level === 'warn') console.warn(msg, safe);
  else console.error(msg, safe);
}

function emitAuthChanged(user) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('slide:auth-changed', {
    detail: { userId: user?.id ?? null },
  }));
}

function sanitizeLegacyHandle(value) {
  return String(value || '')
    .replace(/(\s+|#)0*\s*$/, '')
    .replace(/(?<![0-9])0\s*$/, '')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeLegacyDisplayName(displayName, username) {
  const raw = String(displayName || '').trim();
  if (!raw) return raw;
  const handle = sanitizeLegacyHandle(username);
  if (handle && new RegExp(`^${escapeRegExp(handle)}(?:\\s*#?\\s*0+)?$`, 'i').test(raw)) {
    return handle;
  }
  return raw;
}

function normalizeAuthUser(user) {
  if (!user || typeof user !== 'object') return user;
  const next = { ...user };
  next.username = sanitizeLegacyHandle(next.username);
  next.display_name = sanitizeLegacyDisplayName(next.display_name, next.username || next.email?.split('@')[0]);
  return next;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [accountsVersion, setAccountsVersion] = useState(0);
  const accounts = useMemo(() => getAccounts(), [accountsVersion]);

  // ═══════════════════════════════════════════════════════════
  // SECURITY: Handle automatic logout on auth errors
  // ═══════════════════════════════════════════════════════════
  const handleAuthError = useCallback((code, message) => {
    authLog('warn', 'handleAuthError — session invalidated', { code, message, fixHint: 'Check backend auth middleware or token validity. User needs to re-login.' });
    setUser(null);
    emitAuthChanged(null);
    setAuthError({ code, message });
    invalidateCache(); // Clear all cached data
  }, []);

  // When API cache revalidates /auth/me in background, update user so we don't show stale "?" placeholder
  useEffect(() => {
    const handleCacheUpdated = (e) => {
      const endpoint = e?.detail?.endpoint ?? '';
      const data = e?.detail?.data;
      if (endpoint.includes('/auth/me') && data && typeof data === 'object' && data.id) {
        const normalized = normalizeAuthUser(data);
        setUser((prev) => (prev?.id === normalized.id ? { ...prev, ...normalized } : prev));
      }
    };
    window.addEventListener('slide:cache-updated', handleCacheUpdated);
    return () => window.removeEventListener('slide:cache-updated', handleCacheUpdated);
  }, []);

  useEffect(() => {
    // Set up the auth error handler
    setAuthErrorHandler(handleAuthError);
    authLog('info', 'AuthProvider mounted — session restore starting', { fixHint: 'Filter console by [Auth] for full user-system logs. All logs include fixHint for developers.' });

    const token = getToken();
    if (!token) {
      authLog('info', 'session restore — no stored token', { fixHint: 'User not logged in. Normal on first visit.' });
      setLoading(false);
      return;
    }

    authLog('info', 'session restore — validating token via /me', { tokenLength: token.length, fixHint: 'File: AuthContext.jsx, authApi.me()' });

    // Safety timeout: if /me hangs (e.g. server down, network issue), stop loading after 20s
    const safetyTimeout = setTimeout(() => {
      authLog('warn', 'session restore — timeout (20s)', { fixHint: 'Server may be down or network slow. Check API_BASE, CORS, backend /auth/me.' });
      setLoading(false);
      persistClearToken();
    }, 20000);

    authApi
      .me()
      .then((data) => {
        authLog('info', 'session restore — success', { userId: data?.id, displayName: data?.display_name, fixHint: 'AuthContext.jsx useEffect' });
        const normalized = normalizeAuthUser(data);
        storageAddAccount(normalized, token);
        setAccountsVersion((v) => v + 1);
        setUser(normalized);
        emitAuthChanged(normalized);
        setAuthError(null);
      })
      .catch(async (err) => {
        authLog('warn', 'session restore — /me failed, trying refresh token', { error: err?.message });
        // Try refresh token flow
        try {
          const rt = await getRefreshToken();
          if (rt) {
            authLog('info', 'session restore — attempting token refresh');
            const { token: newToken, refreshToken: newRt, user } = await authApi.refresh(rt);
            if (newToken && user) {
              const normalized = normalizeAuthUser(user);
              await persistToken(newToken);
              if (newRt) await setRefreshToken(newRt);
              else await clearRefreshToken();
              storageAddAccount(normalized, newToken);
              setAccountsVersion((v) => v + 1);
              setUser(normalized);
              emitAuthChanged(normalized);
              setAuthError(null);
              authLog('info', 'session restore — refresh token success', { userId: user?.id });
              return;
            }
          }
        } catch (refreshErr) {
          authLog('warn', 'session restore — refresh token failed', { error: refreshErr?.message });
          await clearRefreshToken();
        }
        persistClearToken();
        setAuthError(null);
      })
      .finally(() => {
        clearTimeout(safetyTimeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(safetyTimeout);
      setAuthErrorHandler(null);
    };
  }, [handleAuthError]);

  const login = useCallback(async (email, password) => {
    authLog('info', 'login — attempt', { hasEmail: !!email, hasPassword: !!password, fixHint: 'AuthContext.jsx login() -> authApi.login()' });
    const deviceId = getOrCreateDeviceId();
    const deviceName = await getDeviceName();
    return authApi.login(email, password, deviceId, deviceName).then(async (data) => {
      if (data.requires2FA && data.tempToken) {
        authLog('info', 'login — 2FA required', { userId: data?.user?.id, fixHint: 'User must enter TOTP code. Login.jsx verify2FA flow.' });
        resetRateLimit('login');
        return { requires2FA: true, tempToken: data.tempToken, user: data.user };
      }
      const { user, token } = data;
      const normalized = normalizeAuthUser(user);
      authLog('info', 'login — success', { userId: user?.id, displayName: user?.display_name, fixHint: 'AuthContext.jsx login()' });
      storageAddAccount(normalized, token);
      setAccountsVersion((v) => v + 1);
      await persistToken(token);
      if (data.refreshToken) await setRefreshToken(data.refreshToken);
      setUser(normalized);
      emitAuthChanged(normalized);
      setAuthError(null);
      resetRateLimit('login');
      return user;
    }).catch((err) => {
      authLog('warn', 'login — failed', { error: err?.message, status: err?.status, fixHint: 'Check backend /auth/login, credentials, rate limit.' });
      throw err;
    });
  }, []);

  const verify2FA = useCallback(async (tempToken, code) => {
    authLog('info', 'verify2FA — attempt', { hasTempToken: !!tempToken, codeLength: (code || '').length, fixHint: 'AuthContext.jsx verify2FA() -> authApi.verify2FA()' });
    const deviceId = getOrCreateDeviceId();
    const deviceName = await getDeviceName();
    return authApi.verify2FA(tempToken, code, deviceId, deviceName).then(async ({ user, token, refreshToken: rt2fa }) => {
      const normalized = normalizeAuthUser(user);
      authLog('info', 'verify2FA — success', { userId: user?.id, fixHint: 'AuthContext.jsx verify2FA()' });
      storageAddAccount(normalized, token);
      setAccountsVersion((v) => v + 1);
      await persistToken(token);
      if (rt2fa) await setRefreshToken(rt2fa);
      setUser(normalized);
      emitAuthChanged(normalized);
      setAuthError(null);
      resetRateLimit('login');
      return user;
    }).catch((err) => {
      authLog('warn', 'verify2FA — failed', { error: err?.message, fixHint: 'Invalid TOTP code or expired tempToken. Check backend /auth/2fa/verify.' });
      throw err;
    });
  }, []);

  const loginWithQrToken = useCallback(async (qrToken) => {
    authLog('info', 'loginWithQrToken — check', { hasToken: !!qrToken, fixHint: 'AuthContext.jsx loginWithQrToken() -> authApi.qrLogin.check()' });
    const data = await authApi.qrLogin.check(qrToken);
    if (data?.status === 'approved' && data.user && data.token) {
      authLog('info', 'loginWithQrToken — approved', { userId: data.user?.id, fixHint: 'QR login from mobile app approved.' });
      const normalized = normalizeAuthUser(data.user);
      storageAddAccount(normalized, data.token);
      setAccountsVersion((v) => v + 1);
      await persistToken(data.token);
      setUser(normalized);
      emitAuthChanged(normalized);
      setAuthError(null);
      resetRateLimit('login');
      return data.user;
    }
    authLog('info', 'loginWithQrToken — not approved', { status: data?.status, fixHint: 'QR code expired or not yet scanned. Check qr-login flow.' });
    return null;
  }, []);

  const completeQrLogin = useCallback(async (user, token) => {
    const normalized = normalizeAuthUser(user);
    authLog('info', 'completeQrLogin — applying token', { userId: user?.id, fixHint: 'AuthContext.jsx completeQrLogin()' });
    storageAddAccount(normalized, token);
    setAccountsVersion((v) => v + 1);
    await persistToken(token);
    setUser(normalized);
    emitAuthChanged(normalized);
    setAuthError(null);
    resetRateLimit('login');
    return user;
  }, []);

  const loginWithToken = useCallback(async (user, token) => {
    const normalized = normalizeAuthUser(user);
    authLog('info', 'loginWithToken — applying token', { userId: user?.id, fixHint: 'AuthContext.jsx loginWithToken()' });
    storageAddAccount(normalized, token);
    setAccountsVersion((v) => v + 1);
    await persistToken(token);
    setUser(normalized);
    emitAuthChanged(normalized);
    setAuthError(null);
    resetRateLimit('login');
    return user;
  }, []);

  const register = useCallback((email, password, displayName, username) => {
    authLog('info', 'register — attempt', { displayName, username, fixHint: 'AuthContext.jsx register() -> authApi.register()' });
    return authApi.register(email, password, displayName, username).then(async ({ user, token }) => {
      const normalized = normalizeAuthUser(user);
      authLog('info', 'register — success', { userId: user?.id, displayName: user?.display_name, fixHint: 'AuthContext.jsx register()' });
      storageAddAccount(normalized, token);
      setAccountsVersion((v) => v + 1);
      await persistToken(token);
      setUser(normalized);
      emitAuthChanged(normalized);
      setAuthError(null);
      resetRateLimit('register');
      return user;
    }).catch((err) => {
      authLog('warn', 'register — failed', { error: err?.message, status: err?.status, fixHint: 'Check backend /auth/register, validation, duplicate email/username.' });
      throw err;
    });
  }, []);

  const logout = useCallback(async () => {
    authLog('info', 'logout', { previousUserId: user?.id, fixHint: 'AuthContext.jsx logout() — token cleared, cache invalidated.' });
    invalidateCache('/auth/me');
    persistClearToken();
    await clearRefreshToken();
    setUser(null);
    emitAuthChanged(null);
    setAuthError(null);
    invalidateCache();
  }, [user?.id]);

  const switchAccount = useCallback(async (userId) => {
    const token = getAccountToken(userId);
    if (!token) {
      authLog('warn', 'switchAccount — no token for user', { userId });
      return;
    }
    authLog('info', 'switchAccount', { userId, fixHint: 'AuthContext.jsx switchAccount()' });
    await persistToken(token);
    // Prevent serving stale /auth/me data from previous account cache.
    invalidateCache('/auth/me');
    try {
      const data = await authApi.me();
      const normalized = normalizeAuthUser(data);
      setUser(normalized);
      emitAuthChanged(normalized);
      setAuthError(null);
      invalidateCache();
      // Refresh page so all app state (socket, contexts, cached data) reflects the new account
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      authLog('warn', 'switchAccount — /me failed, token may be expired', { userId, error: err?.message });
      storageRemoveAccount(userId);
      setAccountsVersion((v) => v + 1);
      throw err;
    }
  }, []);

  const removeAccount = useCallback((userId) => {
    storageRemoveAccount(userId);
    setAccountsVersion((v) => v + 1);
    authLog('info', 'removeAccount', { userId });
  }, []);

  // Clear the auth error after it's been shown
  const clearAuthError = useCallback(() => {
    authLog('info', 'clearAuthError', { fixHint: 'AuthContext.jsx — user dismissed auth error' });
    setAuthError(null);
  }, []);

  // Call API and update state
  const updateUserApi = useCallback((data) => {
    authLog('info', 'updateUserApi — request', { keys: Object.keys(data || {}), fixHint: 'AuthContext.jsx updateUserApi() -> authApi.updateMe()' });
    return authApi.updateMe(data).then((updated) => {
      authLog('info', 'updateUserApi — success', { userId: updated?.id, fixHint: 'AuthContext.jsx updateUserApi()' });
      const normalized = normalizeAuthUser(updated);
      setUser((u) => (u ? { ...u, ...normalized } : null));
      return normalized;
    }).catch((err) => {
      authLog('warn', 'updateUserApi — failed', { error: err?.message, fixHint: 'Check backend /auth/me PATCH, validation.' });
      throw err;
    });
  }, []);

  // Just update local state (for when API was called separately)
  const updateUser = useCallback((data) => {
    setUser((u) => (u ? { ...u, ...normalizeAuthUser(data) } : null));
  }, []);

  const value = { 
    user, 
    loading, 
    accounts,
    login, 
    verify2FA,
    loginWithQrToken,
    completeQrLogin,
    loginWithToken,
    register, 
    logout, 
    switchAccount,
    removeAccount,
    updateUser, 
    updateUserApi,
    authError,
    clearAuthError
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
