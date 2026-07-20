"use client";

import { useEffect, useRef, useState } from "react";


export type PeriodKey = "today" | "yesterday" | "7d" | "15d" | "30d" | "60d";

export interface PeriodValue {
  key: PeriodKey;
  label: string;
}

const OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "15d", label: "Últimos 15 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "60d", label: "Últimos 60 dias" },
];

interface PeriodFilterProps {
  value?: PeriodValue;
  onChange?: (period: PeriodValue) => void;
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>(
    value ?? { key: "7d", label: "Últimos 7 dias" }
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setPeriod(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function selectPreset(key: PeriodKey, label: string) {
    const next: PeriodValue = { key, label };
    setPeriod(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 self-center"
      style={{ width: 148 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center gap-1.5 px-2.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
        style={{
          height: 34,
          border: "none",
          borderRadius: "var(--radius-md)",
          background: "var(--green-use)",
          color: "var(--on-green)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* Funil filled cor on-green no botão */}
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          style={{ color: "var(--on-green)", flexShrink: 0 }}
        >
          <path d="M3.2 4.5c-.4-.6 0-1.5.8-1.5h16c.8 0 1.2.9.8 1.5l-6.3 8.2v5.6c0 .3-.2.6-.4.8l-3.2 2.2c-.5.3-1.1 0-1.1-.6v-8L3.2 4.5z" />
        </svg>
        <span className="truncate min-w-0">{period.label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 left-0 z-50 mt-2 overflow-hidden"
          style={{
            width: "100%",
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          }}
          role="listbox"
        >
          <ul className="py-1.5">
            {OPTIONS.map((opt) => {
              const active = period.key === opt.key;
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => selectPreset(opt.key, opt.label)}
                    className="flex w-full items-center justify-center px-3 py-2.5 text-center text-[13px] transition-colors"
                    style={{
                      background: "transparent",
                      color: active ? "var(--green-use)" : "var(--text-1)",
                      fontWeight: active ? 600 : 500,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
