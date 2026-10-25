import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
  }, []);

  const icon = toast?.type === 'error'
    ? 'error_outline'
    : toast?.type === 'warning'
    ? 'warning'
    : toast?.type === 'info'
    ? 'info'
    : 'check_circle';

  const iconColor = toast?.type === 'error'
    ? '#fca5a5'
    : toast?.type === 'warning'
    ? '#fcd34d'
    : toast?.type === 'info'
    ? '#93c5fd'
    : '#86efac';

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`snackbar ${visible ? 'visible' : 'hidden'} ${toast?.type || 'success'}`}
        role="status"
        aria-live="polite"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: iconColor }}>{icon}</span>
        <span>{toast?.message}</span>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
