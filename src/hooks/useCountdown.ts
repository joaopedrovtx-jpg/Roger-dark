"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CountdownOptions {
  seconds: number;
  onExpire?: () => void;
  stepMs?: number;
  autoStart?: boolean;
}

/** Contagem regressiva (segundos) — útil p/ expiração do QR PIX (15 min). */
export function useCountdown({
  seconds,
  onExpire,
  stepMs = 1000,
  autoStart = true,
}: CountdownOptions) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(autoStart);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const tick = useCallback(() => {
    setRemaining((r) => {
      if (r <= 1) {
        setRunning(false);
        onExpireRef.current?.();
        return 0;
      }
      return r - 1;
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, stepMs);
    return () => clearInterval(id);
  }, [running, tick, stepMs]);

  const start = useCallback(() => {
    setRemaining(seconds);
    setRunning(true);
  }, [seconds]);
  const pause = useCallback(() => setRunning(false), []);
  const resume = useCallback(() => setRunning(true), []);
  const reset = useCallback(() => {
    setRemaining(seconds);
    setRunning(false);
  }, [seconds]);

  const total = seconds;
  const progress = total > 0 ? remaining / total : 0;
  const expired = remaining === 0;

  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  const formatted = `${mm}:${ss}`;

  return {
    remaining,
    formatted,
    progress,
    expired,
    running,
    start,
    pause,
    resume,
    reset,
  };
}