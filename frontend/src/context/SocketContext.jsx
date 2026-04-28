import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getToken } from '../utils/tokenStorage';
import { BACKEND_ORIGIN } from '../api';

const SocketContext = createContext(null);
const OnlineUsersContext = createContext(null);
const EMPTY_ONLINE_CTX = { onlineUsers: new Set(), isUserOnline: () => false };

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socketRef = useRef(null);
  const presenceBatchRef = useRef(null);
  const pendingPresenceRef = useRef(new Map());

  const isUserOnline = useCallback((userId) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setOnlineUsers(new Set());
      }
      return;
    }

    const token = getToken();
    const socketTarget = (typeof window !== 'undefined' && window.location?.origin === BACKEND_ORIGIN)
      ? window.location.origin
      : BACKEND_ORIGIN;
    const s = io(socketTarget, {
      path: '/socket.io',
      auth: { token, displayName: user.display_name },
      transports: ['websocket'],
      upgrade: false,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 15000,
      forceNew: true,
      multiplex: false,
    });

    s.on('online_users', (userIds) => {
      setOnlineUsers(new Set(userIds));
    });

    // Batch presence updates: collect for 500ms then apply once
    s.on('presence', ({ userId, status }) => {
      pendingPresenceRef.current.set(userId, status);
      if (!presenceBatchRef.current) {
        presenceBatchRef.current = setTimeout(() => {
          const batch = pendingPresenceRef.current;
          pendingPresenceRef.current = new Map();
          presenceBatchRef.current = null;
          setOnlineUsers(prev => {
            const next = new Set(prev);
            for (const [uid, st] of batch) {
              if (st === 'online') next.add(uid);
              else next.delete(uid);
            }
            return next;
          });
        }, 500);
      }
    });

    s.on('connect', () => {
      if (typeof window !== 'undefined') {
        window.__SLIDE_SOCKET_ID = s.id;
      }
      s.emit('get_online_users');
    });
    
    socketRef.current = s;
    setSocket(s);
    
    return () => {
      if (presenceBatchRef.current) clearTimeout(presenceBatchRef.current);
      if (socketRef.current) {
        socketRef.current.off('online_users');
        socketRef.current.off('presence');
        socketRef.current.off('connect');
        socketRef.current.disconnect();
        socketRef.current = null;
        if (typeof window !== 'undefined') {
          window.__SLIDE_SOCKET_ID = null;
        }
        setSocket(null);
        setOnlineUsers(new Set());
      }
    };
  }, [user?.id]);

  const onlineUsersValue = useMemo(() => ({ onlineUsers, isUserOnline }), [onlineUsers, isUserOnline]);

  return (
    <SocketContext.Provider value={socket}>
      <OnlineUsersContext.Provider value={onlineUsersValue}>
        {children}
      </OnlineUsersContext.Provider>
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useOnlineUsers() {
  return useContext(OnlineUsersContext);
}
