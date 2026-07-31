"use client";

import { useEffect } from "react";
import { useTurnstile, type UseTurnstileOptions } from "@/hooks/useTurnstile";

export interface TurnstileWidgetProps extends UseTurnstileOptions {
  /** Container className/id p/ layout. */
  className?: string;
  /** Esvazia o widget quando `visible=false` (UX p/ step de 2FA). */
  visible?: boolean;
  /**
   * Recebe o controller do hook sempre que seus campos relevantes mudam
   * (token/loading/error/expired). Use p/ o form pai enviar `token` na
   * mutation e chamar `reset()` em erros.
   */
  onReady?: (controller: ReturnType<typeof useTurnstile>) => void;
}

/**
 * Widget Cloudflare Turnstile.
 *
 * Renderiza o <div> container e emite o controller do hook `useTurnstile`
 * via `onReady` (em `useEffect` — nunca no corpo do render, evitando
 * re-render loop e efeito colateral síncrono).
 *
 * Caso Turnstile não esteja configurado (sem NEXT_PUBLIC_TURNSTILE_SITE_KEY),
 * o componente renderiza `null` — o servidor também pula a verificação.
 */
export function TurnstileWidget({
  className,
  visible = true,
  onReady,
  ...opts
}: TurnstileWidgetProps) {
  const controller = useTurnstile(opts);

  // Notifica o pai apenas quando campos relevantes mudam.
  useEffect(() => {
    if (onReady) onReady(controller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    controller.token,
    controller.loading,
    controller.error,
    controller.expired,
    controller.enabled,
    onReady,
  ]);

  if (!controller.enabled || !visible) return null;

  return (
    <div
      ref={controller.containerRef}
      className={className}
      aria-label="Verificação anti-bot"
      style={{ minHeight: 65 }}
    />
  );
}