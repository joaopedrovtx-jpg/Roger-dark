"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import { AuthInput, authButtonStyle } from "./AuthInput";
import { authedFetch } from "@/lib/client/session";

const RESET_EMAIL_KEY = "darkpay.auth.resetEmail";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  /** Código só em dev (sem RESEND_API_KEY) — e-mail real não está configurado */
  const [devCode, setDevCode] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setHint(null);
    setDevCode(null);

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
    try {
      const res = await authedFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        debugCode?: string;
        emailMode?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Não foi possível enviar o e-mail.");
      }

      try {
        window.sessionStorage.setItem(RESET_EMAIL_KEY, trimmed);
      } catch {
        /* ignore */
      }

      setSuccess(true);

      // Sem RESEND_API_KEY o e-mail NÃO sai da caixa — só log no servidor
      if (json.emailMode === "log" || json.debugCode) {
        setDevCode(json.debugCode || null);
        setHint(
          "E-mail real ainda não está configurado (falta RESEND_API_KEY no .env). " +
            "Use o código abaixo para testar a redefinição."
        );
      } else if (json.emailMode === "resend") {
        setHint(
          "Código enviado por e-mail. Confira a caixa de entrada e o spam."
        );
      } else {
        setHint(
          "Se o e-mail estiver cadastrado, enviamos o código. Confira também o spam."
        );
      }

      // Com e-mail real, redireciona; em dev com código na tela, espera o usuário copiar
      const delay = json.debugCode ? 4500 : 1400;
      window.setTimeout(() => {
        router.push(
          `/redefinir-senha?email=${encodeURIComponent(trimmed)}${
            json.debugCode
              ? `&code=${encodeURIComponent(json.debugCode)}`
              : ""
          }`
        );
      }, delay);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível enviar o e-mail."
      );
    } finally {
      setLoading(false);
    }
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
          Informe o e-mail da conta. Enviaremos um código para redefinir a
          senha.
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
              Pronto! Se o e-mail existir, o código foi enviado.
            </span>
          </div>
        ) : null}

        {hint ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--text-3)",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {hint}
          </p>
        ) : null}

        {devCode ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid rgba(251, 191, 36, 0.45)",
              background: "rgba(251, 191, 36, 0.1)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
                marginBottom: 8,
              }}
            >
              Código de teste (e-mail não enviado)
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "0.25em",
                color: "var(--text-1)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {devCode}
            </div>
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
            ? "Enviando…"
            : success
              ? "Redirecionando…"
              : "Enviar código"}
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
