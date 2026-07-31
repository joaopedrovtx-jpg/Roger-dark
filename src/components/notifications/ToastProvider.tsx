"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  createdAt: number;
}

export interface ToastInput {
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  toast: (input: ToastInput) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-[var(--green-soft)] bg-[var(--bg-elevated)]",
  error: "border-red-500/40 bg-[var(--bg-elevated)]",
  info: "border-[var(--border-muted)] bg-[var(--bg-elevated)]",
  warning: "border-yellow-500/40 bg-[var(--bg-elevated)]",
};

const VARIANT_DOT: Record<ToastVariant, string> = {
  success: "bg-[var(--green-use)]",
  error: "bg-red-500",
  info: "bg-sky-500",
  warning: "bg-yellow-500",
};

function ToastView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${VARIANT_STYLES[toast.variant]}`}
    >
      <span
        aria-hidden
        className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${VARIANT_DOT[toast.variant]}`}
      />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {toast.title}
          </p>
        ) : null}
        <p className="break-words text-sm text-[var(--text-secondary)]">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      counterRef.current += 1;
      const id = `t_${Date.now().toString(36)}_${counterRef.current}`;
      const item: ToastItem = {
        id,
        title: input.title,
        message: input.message,
        variant: input.variant ?? "info",
        duration: input.duration ?? 4000,
        createdAt: Date.now(),
      };
      setToasts((list) => [...list, item]);
      if (item.duration > 0) {
        setTimeout(() => dismiss(id), item.duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      toast,
      success: (m, t) => toast({ message: m, title: t, variant: "success" }),
      error: (m, t) => toast({ message: m, title: t, variant: "error" }),
      info: (m, t) => toast({ message: m, title: t, variant: "info" }),
      warning: (m, t) => toast({ message: m, title: t, variant: "warning" }),
      dismiss,
    }),
    [toasts, toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      toast: () => "",
      success: () => "",
      error: () => "",
      info: () => "",
      warning: () => "",
      dismiss: () => {},
    };
  }
  return ctx;
}