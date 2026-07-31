"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearImpersonateSeller,
  getImpersonateSeller,
  IMPERSONATE_STORAGE_KEY,
  isImpersonating,
  setImpersonateSeller,
  type ImpersonateSeller,
} from "@/lib/client/impersonate";

export interface ImpersonateContextValue {
  seller: ImpersonateSeller | null;
  impersonating: boolean;
  viewOnly: boolean;
  start: (input: { id: string; name: string; email?: string }) => void;
  stop: () => void;
}

const ImpersonateContext = createContext<ImpersonateContextValue | null>(null);

export function ImpersonateProvider({ children }: { children: ReactNode }) {
  const [seller, setSeller] = useState<ImpersonateSeller | null>(null);

  const refresh = useCallback(() => {
    setSeller(getImpersonateSeller());
  }, []);

  useEffect(() => {
    refresh();
    function onImpersonate(e: Event) {
      const detail = (e as CustomEvent<ImpersonateSeller | null>).detail;
      setSeller(detail ?? null);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === IMPERSONATE_STORAGE_KEY) refresh();
    }
    window.addEventListener("darkpay:impersonate", onImpersonate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("darkpay:impersonate", onImpersonate);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const value = useMemo<ImpersonateContextValue>(
    () => ({
      seller,
      impersonating: isImpersonating(),
      viewOnly: Boolean(seller?.id),
      start: (input) => {
        setImpersonateSeller(input);
        setSeller(getImpersonateSeller());
      },
      stop: () => {
        clearImpersonateSeller();
        setSeller(null);
      },
    }),
    [seller]
  );

  return (
    <ImpersonateContext.Provider value={value}>
      {children}
    </ImpersonateContext.Provider>
  );
}

export function useImpersonate(): ImpersonateContextValue {
  const ctx = useContext(ImpersonateContext);
  if (!ctx) {
    return {
      seller: null,
      impersonating: false,
      viewOnly: false,
      start: () => {},
      stop: () => {},
    };
  }
  return ctx;
}