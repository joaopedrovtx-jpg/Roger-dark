"use client";

import { useEffect, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { fetchTurnstilePublicConfig } from "@/lib/client/turnstile";

export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchTurnstilePublicConfig();
      if (cancelled) return;
      if (cfg.enabled && cfg.siteKey) {
        setSiteKey(cfg.siteKey);
      } else {
        setSiteKey(null);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ainda carregando config — espaço reservado
  if (!ready) {
    return (
      <div
        aria-hidden
        style={{
          minHeight: 65,
          width: "100%",
          maxWidth: 300,
          borderRadius: 8,
          background: "rgba(255,255,255,0.04)",
        }}
      />
    );
  }

  // Sem chave configurada no servidor
  if (!siteKey) return null;

  return (
    <div className="flex flex-col items-center" style={{ gap: 8 }}>
      <Turnstile
        siteKey={siteKey}
        onSuccess={onToken}
        onError={() => {
          setLoadError(true);
          onToken(null);
        }}
        onExpire={() => onToken(null)}
        options={{
          theme: "dark",
          size: "normal",
        }}
      />
      {loadError ? (
        <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>
          Falha ao carregar a verificação. Recarregue a página.
        </p>
      ) : null}
    </div>
  );
}
