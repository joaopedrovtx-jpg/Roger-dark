import type { CSSProperties, ReactNode } from "react";

interface AdminTableProps {
  title: string;
  headers: string[];
  children: ReactNode;
}

export function AdminTable({ title, headers, children }: AdminTableProps) {
  return (
    <div
      className="surface-card overflow-hidden"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div
        className="px-5 py-4 text-center"
        style={{ borderBottom: "1px solid var(--border-card)" }}
      >
        <h2
          className="font-semibold"
          style={{ fontSize: 15, color: "var(--text-1)" }}
        >
          {title}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 font-medium text-center"
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
                    borderBottom: "1px solid var(--border-card)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminTd({
  children,
  nowrap,
  bold,
  align = "center",
}: {
  children: ReactNode;
  nowrap?: boolean;
  bold?: boolean;
  align?: "center" | "left" | "right";
}) {
  return (
    <td
      className={`px-4 py-3.5 ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}
      style={{
        fontSize: 13,
        color: bold ? "var(--text-1)" : "var(--text-2)",
        fontWeight: bold ? 600 : 400,
        borderBottom: "1px solid var(--border-card)",
        whiteSpace: nowrap ? "nowrap" : undefined,
      }}
    >
      {children}
    </td>
  );
}

export function AdminActionButton({
  children,
  onClick,
  variant = "ghost",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger" | "success";
  disabled?: boolean;
}) {
  const styles: Record<string, CSSProperties> = {
    ghost: {
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-muted)",
      color: "var(--text-1)",
    },
    primary: {
      background: "var(--green-use)",
      border: "none",
      color: "var(--on-green)",
    },
    success: {
      background: "rgba(255,255,255,0.1)",
      border: "1px solid var(--border-muted)",
      color: "var(--green-use)",
    },
    danger: {
      background: "#ef4444",
      border: "none",
      color: "#ffffff",
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center font-semibold text-[12px] transition-opacity hover:opacity-90 whitespace-nowrap"
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function AdminFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold text-[12px] transition-opacity"
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 10,
        border: active
          ? "1px solid var(--green-use)"
          : "1px solid var(--border-muted)",
        background: active ? "var(--green-use)" : "var(--bg-elevated)",
        color: active ? "var(--on-green)" : "var(--text-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
