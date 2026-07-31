"use client";

import { useEffect } from "react";
import { useTurnstile, type UseTurnstileOptions } from "@/hooks/useTurnstile";

export interface TurnstileWidgetProps extends UseTurnstileOptions {
  className?: string;
  visible?: boolean;
  onReady?: (controller: ReturnType<typeof useTurnstile>) => void;
}

/**
 * Widget Cloudflare Turnstile.
 * Site key via build env ou GET /api/v1/public/turnstile (runtime).
 * Sem keys (site+secret no servidor) → null.
 */
export function TurnstileWidget({
  className,
  visible = true,
  onReady,
  ...opts
}: TurnstileWidgetProps) {
  const controller = useTurnstile(opts);

  useEffect(() => {
    if (onReady) onReady(controller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    controller.token,
    controller.loading,
    controller.error,
    controller.expired,
    controller.enabled,
    controller.ready,
    onReady,
  ]);

  if (!visible) return null;

  // Ainda resolvendo se captcha está ligado
  if (!controller.ready) {
    return (
      <div
        className={className}
        aria-hidden
        style={{
          minHeight: 65,
          width: "100%",
          maxWidth: 300,
          margin: "0 auto",
          borderRadius: 8,
          background: "rgba(255,255,255,0.04)",
        }}
      />
    );
  }

  if (!controller.enabled) return null;

  return (
    <div className={className} style={{ width: "100%" }}>
      <div
        ref={controller.containerRef}
        aria-label="Verificação anti-bot"
        style={{ minHeight: 65, display: "flex", justifyContent: "center" }}
      />
      {controller.error ? (
        <p
          role="alert"
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "#f87171",
            textAlign: "center",
          }}
        >
          {controller.error}
        </p>
      ) : null}
    </div>
  );
}
