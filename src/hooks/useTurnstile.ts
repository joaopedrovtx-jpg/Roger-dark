"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Hook client-side p/ renderizar e capturar o token do Cloudflare Turnstile.
 *
 * Carrega o script `https://challenges.cloudflare.com/turnstile/v0/api.js`
 * via inject uma única vez, depois renderiza o widget no elemento alvo e
 * expõe o token + estado de loading/erro.
 *
 * Quando Turnstile está desabilitado (sem NEXT_PUBLIC_TURNSTILE_SITE_KEY),
 * o hook retorna `enabled=false` e `token=""` — o servidor também pula a
 * verificação, mantendo o fluxo em dev/local.
 *
 * Uso típico:
 *   const { token, containerRef, reset, enabled, error } = useTurnstile();
 *   <div ref={containerRef} />;
 *   submit({ ..., turnstileToken: token });
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
/** Cloudflare: cdata máximo 32 chars. */
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
  /** Ação nominal p/ analytics Cloudflare (ex.: "login"). */
  action?: string;
  /** Tema visual; default "dark" p/ casar com DarkPay. */
  theme?: "light" | "dark" | "auto";
  /** Compacto p/ mobile. */
  size?: "normal" | "compact";
  /** Idioma (`pt-br`). */
  language?: string;
  /** Idempotência/controle — mapa p/ `cdata` (máx 32 chars). */
  cdata?: string;
}

export interface UseTurnstileResult {
  enabled: boolean;
  siteKey: string;
  token: string;
  loading: boolean;
  error: string | null;
  expired: boolean;
  /** Ref callback p/ atribuir ao <div> container do widget. */
  containerRef: (el: HTMLElement | null) => void;
  /** Re-renderiza o widget (token novo). */
  reset: () => void;
  /** Limpa token atual. */
  clear: () => void;
}

export function useTurnstile(
  options: UseTurnstileOptions = {}
): UseTurnstileResult {
  const siteKey =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ||
    "";
  const enabled = !!siteKey && siteKey.length > 8;

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const containerElRef = useRef<HTMLElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);

  // Mantém options atualizadas sem precisar re-renderizar o widget.
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

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
      if (!enabled || !window.turnstile) {
        setLoading(false);
        return;
      }
      try {
        destroy();
        const opts = optionsRef.current;
        // CF exige cdata <= 32 chars; trunca p/ evitar rejeição silenciosa.
        const cdata =
          typeof opts.cdata === "string" && opts.cdata.length > 0
            ? opts.cdata.slice(0, CDATA_MAX)
            : undefined;
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          theme: opts.theme ?? "dark",
          size: opts.size ?? "normal",
          language: opts.language ?? "pt-br",
          action: opts.action,
          cdata,
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
    [destroy, enabled, siteKey]
  );

  const containerRef = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el;
      if (!el) {
        destroy();
        return;
      }
      if (!enabled) {
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
    [destroy, enabled, renderWidget]
  );

  const reset = useCallback(() => {
    // Limpa PRIMEIRO: o `turnstile.reset` da CF NÃO garante chamar
    // `callback` novamente — sem token conhecido, o form não envia.
    setToken("");
    setError(null);
    setExpired(false);
    setLoading(enabled);
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        return;
      } catch {
        /* cai no re-render abaixo */
      }
    }
    // Fallback: destrói e re-renderiza o widget no mesmo container.
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
    loading,
    error,
    expired,
    containerRef,
    reset,
    clear,
  };
}