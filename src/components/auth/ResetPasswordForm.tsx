"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { AuthInput, authButtonStyle } from "./AuthInput";

const RESET_EMAIL_KEY = "darkpay.auth.resetEmail";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fromQueryEmail = searchParams.get("email")?.trim() ?? "";
    const fromQueryToken = searchParams.get("token")?.trim() ?? "";
    let fromSession = "";
    try {
      fromSession = window.sessionStorage.getItem(RESET_EMAIL_KEY) ?? "";
    } catch {
      /* ignore */
    }
    setEmail(fromQueryEmail || fromSession);
    setToken(fromQueryToken);
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email) {
      setError("E-mail ausente. Volte para a tela anterior e solicite um novo link.");
      return;
    }
    if (!token) {
      setError("Token ausente. Use o link enviado por e-mail.");
      return;
    }
    if (!password) {
      setError("Informe a nova senha.");
      return;
    }
    if (password.length < 10) {
      setError("A senha deve ter pelo menos 10 caracteres, com letras e números.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("A senha deve conter letras e números.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, newPassword: password }),
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "Falha ao redefinir a senha.");
      }
      try {
        window.sessionStorage.removeItem(RESET_EMAIL_KEY);
      } catch {
        /* ignore */
      }
      setSuccess(true);
      window.setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao redefinir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 28 }}>
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
          Criar nova senha
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          {email
            ? `Defina uma nova senha para ${email}.`
            : "Use o link enviado por e-mail para continuar."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 14 }}
        noValidate
      >
        <AuthInput
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock size={18} strokeWidth={1.8} />}
        />

        <AuthInput
          label="Confirme sua senha"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          icon={<Lock size={18} strokeWidth={1.8} />}
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
              Senha redefinida! Redirecionando para o login…
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
            ? "Alterando…"
            : success
              ? "Redirecionando…"
              : "Alterar senha"}
        </button>
      </form>

      <p
        className="text-center"
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--text-2)",
          lineHeight: 1.5,
        }}
      >
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
