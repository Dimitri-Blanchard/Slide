import React, { createContext, useContext, useState, useEffect } from 'react';

const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const [scene, setScene] = useState('ambient');

  useEffect(() => {
    const cycle = ['ambient', 'focus', 'settle'];
    let i = 0;
    const id = setInterval(() => {
      setScene(cycle[i % 3]);
      i++;
    }, 6400);
    return () => clearInterval(id);
  }, []);

  return (
    <SceneContext.Provider value={{ scene }}>
      {children}
    </SceneContext.Provider>
  );
}

export function useScene() {
  const ctx = useContext(SceneContext);
  return ctx?.scene ?? 'ambient';
}
