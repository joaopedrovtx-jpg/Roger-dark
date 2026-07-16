import { Loader2 } from "lucide-react";

type Tone = "success" | "warning" | "danger" | "muted" | "info";

const TONE_COLOR: Record<Tone, string> = {
  success: "var(--green-use)",
  warning: "#f5a623",
  danger: "#ef4444",
  muted: "#8b93a3",
  info: "#3b82f6",
};

interface AdminStatusBadgeProps {
  label: string;
  tone: Tone;
  spinning?: boolean;
}

export function AdminStatusBadge({
  label,
  tone,
  spinning = false,
}: AdminStatusBadgeProps) {
  const color = TONE_COLOR[tone];

  return (
    <span
      className="inline-flex items-center justify-center gap-1.5"
      style={{
        fontSize: 13,
        fontWeight: 600,
        color,
      }}
    >
      {spinning ? (
        <Loader2
          size={14}
          strokeWidth={2.5}
          className="animate-spin"
          style={{ color }}
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}
