"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import { AuthInput, authButtonStyle } from "./AuthInput";

const RESET_EMAIL_KEY = "darkpay.auth.resetEmail";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Informe o e-mail da sua conta.");
      return;
    }
    if (!trimmed.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    // Fluxo local (sem e-mail): só segue para a tela de nova senha
    window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(RESET_EMAIL_KEY, trimmed);
      } catch {
        /* ignore */
      }
      setLoading(false);
      setSuccess(true);
      window.setTimeout(() => {
        router.push(
          `/redefinir-senha?email=${encodeURIComponent(trimmed)}`
        );
      }, 900);
    }, 650);
  }

  return (
    <div className="flex flex-col" style={{ gap: 28 }}>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoUrl}
          alt="Dark Pay"
          style={{
            height: 48,
            width: "auto",
            maxWidth: 220,
            objectFit: "contain",
          }}
        />
      </div>

      <div className="text-center">
        <h1
          className="font-bold tracking-tight"
          style={{
            margin: 0,
            fontSize: 26,
            color: "var(--text-1)",
            letterSpacing: "-0.02em",
          }}
        >
          Esqueceu sua senha?
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Informe seu e-mail abaixo para continuar a redefinição.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 16 }}
        noValidate
      >
        <AuthInput
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail size={18} strokeWidth={1.8} />}
        />

        {error ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 13,
              color: "#ef4444",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <div
            role="status"
            className="flex items-center gap-2.5"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(34, 197, 94, 0.35)",
              background: "rgba(34, 197, 94, 0.08)",
            }}
          >
            <span
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "#22c55e",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
              }}
              aria-hidden
            >
              ✓
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--text-1)",
              }}
            >
              Sucesso! Continue para criar a nova senha.
            </span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || success}
          className="auth-cta w-full font-semibold transition-opacity"
          style={{
            ...authButtonStyle,
            cursor: loading || success ? "wait" : "pointer",
            opacity: loading || success ? 0.7 : 1,
          }}
        >
          {loading
            ? "Continuando…"
            : success
              ? "Redirecionando…"
              : "Recuperar senha"}
        </button>
      </form>

      <p
        className="text-center"
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--text-2)",
        }}
      >
        Lembrou a senha?{" "}
        <Link
          href="/login"
          className="font-semibold"
          style={{
            color: "var(--text-1)",
            textDecoration: "none",
          }}
        >
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
