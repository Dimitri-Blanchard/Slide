import React, { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import './UndoToast.css';

const UndoToast = memo(function UndoToast({ message, duration = 5000, onUndo, onComplete, onClose }) {
  const [remaining, setRemaining] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(interval);
          onComplete?.();
          return 0;
        }
        return next;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPaused, onComplete]);
  
  const handleUndo = useCallback(() => {
    setIsPaused(true);
    onUndo?.();
    onClose?.();
  }, [onUndo, onClose]);
  
  const secondsLeft = Math.ceil(remaining / 1000);
  const progress = (remaining / duration) * 100;
  
  return createPortal(
    <div 
      className="undo-toast"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="undo-toast-progress" style={{ width: `${progress}%` }} />
      <div className="undo-toast-content">
        <span className="undo-toast-message">{message}</span>
        <button className="undo-toast-btn" onClick={handleUndo}>
          Annuler ({secondsLeft}s)
        </button>
      </div>
    </div>,
    document.body
  );
});

// Undo Toast Manager - handles multiple toasts and their state
let toastId = 0;
const listeners = new Set();

export const undoToast = {
  show: (message, onConfirm, onUndo) => {
    const id = ++toastId;
    const toast = { id, message, onConfirm, onUndo };
    listeners.forEach((listener) => listener({ type: 'add', toast }));
    return id;
  },
  dismiss: (id) => {
    listeners.forEach((listener) => listener({ type: 'remove', id }));
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Provider component to render toasts
export const UndoToastContainer = memo(function UndoToastContainer() {
  const [toasts, setToasts] = useState([]);
  
  useEffect(() => {
    return undoToast.subscribe((action) => {
      if (action.type === 'add') {
        setToasts((prev) => [...prev, action.toast]);
      } else if (action.type === 'remove') {
        setToasts((prev) => prev.filter((t) => t.id !== action.id));
      }
    });
  }, []);
  
  const handleComplete = useCallback((toast) => {
    toast.onConfirm?.();
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
  }, []);
  
  const handleUndo = useCallback((toast) => {
    toast.onUndo?.();
  }, []);
  
  const handleClose = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  
  return (
    <>
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ '--toast-index': index }}>
          <UndoToast
            message={toast.message}
            onComplete={() => handleComplete(toast)}
            onUndo={() => handleUndo(toast)}
            onClose={() => handleClose(toast.id)}
          />
        </div>
      ))}
    </>
  );
});

export default UndoToast;
