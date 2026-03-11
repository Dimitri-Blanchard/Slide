import React, { createContext, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

const OrbsContext = createContext(null);

export function OrbsProvider({ children }) {
  const { user, updateUser } = useAuth();
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !user) return;
    const orbsHandler = ({ orbs }) => updateUser({ orbs });
    const equippedHandler = (data) => updateUser(data);
    socket.on('orbs_updated', orbsHandler);
    socket.on('user_equipped_updated', equippedHandler);
    return () => {
      socket.off('orbs_updated', orbsHandler);
      socket.off('user_equipped_updated', equippedHandler);
    };
  }, [socket, user?.id, updateUser]);

  const orbs = user?.orbs ?? 0;
  return (
    <OrbsContext.Provider value={{ orbs }}>
      {children}
    </OrbsContext.Provider>
  );
}

export function useOrbs() {
  const ctx = useContext(OrbsContext);
  return ctx?.orbs ?? 0;
}
