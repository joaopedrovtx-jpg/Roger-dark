"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { AuthInput, authButtonStyle } from "./AuthInput";

const RESET_EMAIL_KEY = "darkpay.auth.resetEmail";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendHint, setResendHint] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get("email")?.trim() ?? "";
    let fromSession = "";
    try {
      fromSession = window.sessionStorage.getItem(RESET_EMAIL_KEY) ?? "";
    } catch {
      /* ignore */
    }
    setEmail(fromQuery || fromSession);
  }, [searchParams]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!code.trim()) {
      setError("Informe o código de verificação recebido por e-mail.");
      return;
    }
    if (code.trim().length < 4) {
      setError("Código inválido. Confira o e-mail e tente novamente.");
      return;
    }
    if (!password) {
      setError("Informe a nova senha.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    // Mock: altera senha e volta ao login
    window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(RESET_EMAIL_KEY);
      } catch {
        /* ignore */
      }
      setLoading(false);
      setSuccess(true);
      window.setTimeout(() => {
        router.push("/login");
      }, 1000);
    }, 700);
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
            ? `Digite o código enviado para ${email} e defina a nova senha.`
            : "Digite o código recebido por e-mail e defina a nova senha."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 14 }}
        noValidate
      >
        <AuthInput
          label="Código de verificação"
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          placeholder="Digite o código recebido"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          icon={<KeyRound size={18} strokeWidth={1.8} />}
        />

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
              Sucesso! Senha alterada. Redirecionando…
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

      {/* Mesma linha: não recebeu o código · reenviar · login */}
      <p
        className="text-center"
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--text-2)",
          lineHeight: 1.5,
        }}
      >
        Não recebeu o código?{" "}
        <button
          type="button"
          onClick={() => {
            setResendHint(
              email
                ? `Código reenviado para ${email} (mock).`
                : "Código reenviado (mock)."
            );
            window.setTimeout(() => setResendHint(null), 3500);
          }}
          className="font-semibold"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-1)",
            cursor: "pointer",
            padding: 0,
            fontSize: 13.5,
          }}
        >
          Reenviar
        </button>
        <span style={{ margin: "0 8px", color: "var(--text-3)" }}>·</span>
        <Link
          href="/login"
          className="font-semibold"
          style={{
            color: "var(--text-1)",
            textDecoration: "none",
          }}
        >
          Login
        </Link>
      </p>

      {resendHint ? (
        <p
          role="status"
          className="text-center"
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "var(--text-3)",
          }}
        >
          {resendHint}
        </p>
      ) : null}
    </div>
  );
}
