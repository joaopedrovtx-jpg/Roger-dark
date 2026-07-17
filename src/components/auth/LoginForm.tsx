"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Lock, Mail, Shield } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import { AuthInput, authButtonStyle } from "./AuthInput";
import { authedFetch, clearClientToken } from "@/lib/client/session";

export function LoginForm() {
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goAfterLogin(roles: string[]) {
    const isAdmin = roles.includes("admin");
    const next =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : null;

    let dest = isAdmin ? "/admin" : "/";
    if (safeNext) {
      if (isAdmin) {
        // Admin: só segue next se for área admin ou configurações (ex.: 2FA)
        if (
          safeNext.startsWith("/admin") ||
          safeNext.startsWith("/configuracoes")
        ) {
          dest = safeNext;
        } else {
          dest = "/admin";
        }
      } else {
        // Seller: nunca manda para /admin
        dest = safeNext.startsWith("/admin") ? "/" : safeNext;
      }
    }
    window.location.assign(dest);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (challenge) {
      if (!otp.trim()) {
        setError("Informe o código 2FA.");
        return;
      }
      setLoading(true);
      try {
        clearClientToken();
        const res = await authedFetch("/api/v1/auth/login/2fa", {
          method: "POST",
          body: JSON.stringify({ challenge, token: otp.trim() }),
        });
        const json = (await res.json()) as {
          error?: string;
          user?: { roles?: string[] };
        };
        if (!res.ok) throw new Error(json.error || "Código 2FA inválido");
        goAfterLogin(json.user?.roles || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Não foi possível validar 2FA."
        );
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError("Preencha e-mail e senha para continuar.");
      return;
    }

    setLoading(true);
    try {
      clearClientToken();
      const res = await authedFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = (await res.json()) as {
        error?: string;
        requires2fa?: boolean;
        challenge?: string;
        user?: { roles?: string[] };
      };
      if (!res.ok) throw new Error(json.error || "Não foi possível entrar.");

      if (json.requires2fa && json.challenge) {
        setChallenge(json.challenge);
        setOtp("");
        setLoading(false);
        return;
      }

      goAfterLogin(json.user?.roles || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível entrar."
      );
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
          {challenge ? "Verificação em 2 etapas" : "Bem-vindo(a)!"}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          {challenge
            ? "Digite o código do app autenticador ou um backup code."
            : "Faça login na sua conta real (MySQL)."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 16 }}
        noValidate
      >
        {!challenge ? (
          <>
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
            <div className="flex flex-col" style={{ gap: 8 }}>
              <AuthInput
                label="Senha"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={18} strokeWidth={1.8} />}
              />
              <div className="flex justify-end">
                <Link
                  href="/esqueci-senha"
                  style={{
                    fontSize: 13,
                    color: "var(--text-2)",
                    textDecoration: "none",
                  }}
                >
                  Esqueci a senha
                </Link>
              </div>
            </div>
          </>
        ) : (
          <AuthInput
            label="Código 2FA"
            name="otp"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            icon={<Shield size={18} strokeWidth={1.8} />}
          />
        )}

        {error ? (
          <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...authButtonStyle,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading
            ? "Entrando…"
            : challenge
              ? "Confirmar código"
              : "Entrar"}
        </button>

        {challenge ? (
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setOtp("");
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-2)",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Voltar
          </button>
        ) : (
          <p
            style={{
              margin: 0,
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-2)",
            }}
          >
            Não tem conta?{" "}
            <Link
              href="/registro"
              style={{ color: "var(--text-1)", fontWeight: 600 }}
            >
              Criar conta
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
