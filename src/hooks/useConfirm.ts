"use client";

import { useCallback } from "react";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Diálogo de confirmação destrutiva.
 *
 * Implementação padrão usa `window.confirm` (síncrono). Para UI modal elegante,
 * monte um `ConfirmProvider` que sobrescreva `confirmFn` (não incluso nesta
 * iteração p/ focar no essencial).
 *
 * Uso:
 *   const confirm = useConfirm();
 *   if (await confirm({ message: "Estornar venda?", destructive: true })) {...}
 */
export function useConfirm(
  confirmFn?: (opts: ConfirmOptions) => Promise<boolean>
): (opts: ConfirmOptions) => Promise<boolean> {
  return useCallback(
    async (opts: ConfirmOptions) => {
      if (confirmFn) return confirmFn(opts);
      if (typeof window === "undefined") return false;
      const label = opts.title
        ? `${opts.title}\n\n${opts.message}`
        : opts.message;
      return window.confirm(label);
    },
    [confirmFn]
  );
}