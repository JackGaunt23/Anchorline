"use client";

// Toast stack (top right, auto-dismissing) — mirrors the mockup's sync toasts.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { IconCheck } from "./icons";

interface Toast {
  id: number;
  title: string;
  body: string;
  leaving?: boolean;
}

const ToastContext = createContext<{ showToast: (title: string, body: string) => void }>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((title: string, body: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, title, body }]);
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 220);
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed right-[18px] top-[74px] z-[60] flex w-[min(340px,calc(100vw-36px))] flex-col gap-2.5" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in flex items-start gap-2.5 rounded-md border border-hairline-strong bg-card p-3 px-3.5 shadow-float transition-all duration-200 ${
              t.leaving ? "translate-x-2 opacity-0" : ""
            }`}
          >
            <span className="mt-px flex-none text-good">
              <IconCheck />
            </span>
            <div>
              <div className="text-[12.5px] font-bold">{t.title}</div>
              <div className="mt-0.5 text-xs text-ink-secondary">{t.body}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
