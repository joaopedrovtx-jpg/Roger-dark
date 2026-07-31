"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchTurnstilePublicConfig } from "@/lib/client/turnstile";

/**
 * Hook client-side p/ renderizar e capturar o token do Cloudflare Turnstile.
 *
 * Site key:
 * 1) NEXT_PUBLIC_TURNSTILE_SITE_KEY no build
 * 2) GET /api/v1/public/turnstile (runtime .env — sem rebuild)
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
          language?: string;
          action?: string;
          cdata?: string;
          /** always = sempre mostra o checkbox/botão para clicar */
          appearance?: "always" | "execute" | "interaction-only";
          execution?: "render" | "execute";
          callback?: (token: string) => void;
          "error-callback"?: (error: string) => void;
          "expired-callback"?: () => void;
          "timeout-callback"?: () => void;
          retry?: "auto" | "never";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SCRIPT_ID = "cf-turnstile-script";
const CDATA_MAX = 32;

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script_error")), {
        once: true,
      });
      // se já carregou
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script_error"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface UseTurnstileOptions {
  action?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  language?: string;
  cdata?: string;
}

export interface UseTurnstileResult {
  enabled: boolean;
  siteKey: string;
  token: string;
  loading: boolean;
  ready: boolean;
  error: string | null;
  expired: boolean;
  containerRef: (el: HTMLElement | null) => void;
  reset: () => void;
  clear: () => void;
}

export function useTurnstile(
  options: UseTurnstileOptions = {}
): UseTurnstileResult {
  const [siteKey, setSiteKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const containerElRef = useRef<HTMLElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  const siteKeyRef = useRef("");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchTurnstilePublicConfig();
      if (cancelled) return;
      const key = cfg.siteKey?.trim() || "";
      const on = Boolean(cfg.enabled && key.length >= 8);
      siteKeyRef.current = key;
      setSiteKey(key);
      setEnabled(on);
      setConfigReady(true);
      if (!on) {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const destroy = useCallback(() => {
    if (widgetIdRef.current && window.turnstile?.remove) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
    widgetIdRef.current = null;
  }, []);

  const renderWidget = useCallback(
    async (el: HTMLElement) => {
      const key = siteKeyRef.current;
      if (!key || !window.turnstile) {
        setLoading(false);
        return;
      }
      try {
        destroy();
        const opts = optionsRef.current;
        const cdata =
          typeof opts.cdata === "string" && opts.cdata.length > 0
            ? opts.cdata.slice(0, CDATA_MAX)
            : undefined;
        setLoading(true);
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: key,
          theme: opts.theme ?? "dark",
          size: opts.size ?? "normal",
          language: opts.language ?? "pt-br",
          action: opts.action,
          cdata,
          // Sempre mostra o widget (checkbox/botão) para o usuário clicar e confirmar
          appearance: "always",
          execution: "render",
          callback: (t) => {
            setToken(t);
            setError(null);
            setExpired(false);
            setLoading(false);
          },
          "error-callback": (err) => {
            setError(err || "Erro no widget anti-bot.");
            setLoading(false);
          },
          "expired-callback": () => {
            setExpired(true);
            setToken("");
            setLoading(false);
          },
          "timeout-callback": () => {
            setExpired(true);
            setToken("");
            setError("Verificação expirou. Recarregue.");
            setLoading(false);
          },
          retry: "auto",
        });
      } catch {
        setError("Falha ao renderizar verificação anti-bot.");
        setLoading(false);
      }
    },
    [destroy]
  );

  const containerRef = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el;
      if (!el) {
        destroy();
        return;
      }
      if (!configReady) return;
      if (!enabled || !siteKeyRef.current) {
        setLoading(false);
        return;
      }
      void loadScript()
        .then(() => renderWidget(el))
        .catch(() => {
          setError("Não foi possível carregar verificação anti-bot.");
          setLoading(false);
        });
    },
    [configReady, destroy, enabled, renderWidget]
  );

  // Re-render quando config ficar pronta e o container já existir
  useEffect(() => {
    if (!configReady || !enabled) return;
    const el = containerElRef.current;
    if (!el) return;
    void loadScript()
      .then(() => renderWidget(el))
      .catch(() => {
        setError("Não foi possível carregar verificação anti-bot.");
        setLoading(false);
      });
  }, [configReady, enabled, renderWidget]);

  const reset = useCallback(() => {
    setToken("");
    setError(null);
    setExpired(false);
    setLoading(enabled);
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        return;
      } catch {
        /* fallback */
      }
    }
    if (containerElRef.current) {
      void renderWidget(containerElRef.current);
    }
  }, [enabled, renderWidget]);

  const clear = useCallback(() => {
    setToken("");
    setError(null);
    setExpired(false);
    setLoading(false);
    destroy();
  }, [destroy]);

  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    enabled,
    siteKey,
    token,
    loading: !configReady || loading,
    ready: configReady,
    error,
    expired,
    containerRef,
    reset,
    clear,
  };
}
