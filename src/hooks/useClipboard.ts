"use client";

import { useCallback, useRef, useState } from "react";

export function clipboardAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    !!navigator.clipboard.writeText
  );
}

/** Copia texto p/ clipboard com fallback execCommand. */
export function useClipboard(timeout = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        if (clipboardAvailable()) {
          await navigator.clipboard.writeText(text);
        } else if (typeof document !== "undefined") {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          if (!ok) return false;
        } else {
          return false;
        }
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), timeout);
        return true;
      } catch {
        return false;
      }
    },
    [timeout]
  );

  return { copied, copy };
}