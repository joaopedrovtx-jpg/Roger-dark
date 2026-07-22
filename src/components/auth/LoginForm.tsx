"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import {
  BrandLoadingScreen,
  waitBrandLoadingMin,
} from "@/components/layout/BrandLoadingScreen";
import { AuthInput, authButtonStyle } from "./AuthInput";
import { Icon2FAFilled } from "@/components/dashboard/KpiIcons";
import { authedFetch, clearClientToken } from "@/lib/client/session";
import { isTurnstileClientEnabled } from "@/lib/client/turnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";

export function LoginForm() {
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  /** Sem site key no build, não exige captcha (servidor já ignora se não houver secret). */
  const turnstileRequired = isTurnstileClientEnabled();

  function goAfterLogin(roles: string[]) {
    const isStaff =
      roles.includes("admin") || roles.includes("manager");
    const next =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : null;

    // Admin principal e gerentes → painel Admin
    let dest = isStaff ? "/admin" : "/";
    if (safeNext) {
      if (isStaff) {
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
      const startedAt = Date.now();
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
        // Logo pulsando no mínimo 2s antes de entrar
        await waitBrandLoadingMin(startedAt);
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

    if (turnstileRequired && !turnstileToken) {
      setError("Resolva a verificação de segurança.");
      return;
    }

    setLoading(true);
    const startedAt = Date.now();
    try {
      clearClientToken();
      const res = await authedFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
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

      // Logo pulsando no mínimo 2s antes de entrar no painel
      await waitBrandLoadingMin(startedAt);
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
      {/* Entrando no sistema: logo principal pulsando no centro */}
      {loading ? <BrandLoadingScreen label="Entrando…" /> : null}

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
            : "Faça login na sua conta."}
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
            icon={<Icon2FAFilled size={18} tone="white" />}
          />
        )}

        {error ? (
          <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
        ) : null}

        {!challenge && turnstileRequired ? (
          <div className="flex justify-center">
            <TurnstileWidget onToken={setTurnstileToken} />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={
            loading ||
            (!challenge && turnstileRequired && !turnstileToken)
          }
          style={{
            ...authButtonStyle,
            opacity:
              loading ||
              (!challenge && turnstileRequired && !turnstileToken)
                ? 0.55
                : 1,
            cursor: loading
              ? "wait"
              : !challenge && turnstileRequired && !turnstileToken
                ? "not-allowed"
                : "pointer",
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
