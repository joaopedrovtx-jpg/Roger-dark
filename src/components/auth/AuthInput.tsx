"use client";

import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type CSSProperties,
} from "react";
import { Eye, EyeOff } from "lucide-react";

interface AuthInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  icon?: ReactNode;
  type?: "text" | "email" | "password" | "tel";
  error?: string;
  /** repassado ao input nativo (ex.: numeric para código) */
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "100%",
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-2)",
};

/** Mesmo raio dos inputs/botões da plataforma (Dashboard) */
const RADIUS = "var(--radius-md)";

const inputWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  height: 48,
  padding: "0 14px",
  borderRadius: RADIUS,
  border: "1px solid var(--border-muted)",
  background: "var(--bg-elevated)",
  transition: "border-color 140ms ease, box-shadow 140ms ease",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  border: "none",
  outline: "none",
  boxShadow: "none",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  fontFamily: "inherit",
  borderRadius: RADIUS,
  WebkitAppearance: "none",
  appearance: "none",
};

export function AuthInput({
  label,
  icon,
  type = "text",
  error,
  id,
  ...rest
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = type === "password";
  const inputId = id ?? rest.name;

  // Foco: borda branca (nunca verde do browser / autofill)
  const borderColor = error
    ? "var(--danger, #ef4444)"
    : focused
      ? "var(--border-focus, #ffffff)"
      : "var(--border-muted)";

  return (
    <label style={fieldShell} htmlFor={inputId}>
      <span style={labelStyle}>{label}</span>
      <div
        className="auth-input-wrap"
        style={{
          ...inputWrap,
          borderColor,
          boxShadow: focused ? "0 0 0 1px var(--border-focus, #ffffff)" : "none",
        }}
      >
        {icon ? (
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ color: "var(--text-3)", width: 18 }}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          type={isPassword && showPassword ? "text" : type}
          className="auth-input-field"
          style={inputStyle}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            onClick={() => setShowPassword((v) => !v)}
            className="flex shrink-0 items-center justify-center"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
              padding: 4,
              borderRadius: "var(--radius-sm)",
              outline: "none",
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </div>
      {error ? (
        <span style={{ fontSize: 12, color: "var(--danger, #ef4444)" }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** Estilo padrão dos botões CTA das páginas de auth */
export const authButtonStyle: CSSProperties = {
  height: 48,
  marginTop: 4,
  border: "none",
  borderRadius: "var(--radius-md)",
  background: "var(--green-use)",
  color: "var(--on-green)",
  fontSize: 15,
  fontWeight: 600,
  outline: "none",
  boxShadow: "none",
};
