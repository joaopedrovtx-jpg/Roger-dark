"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthInput, authButtonStyle } from "./AuthInput";

export function LoginForm() {
  const { branding } = useBranding();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Preencha e-mail e senha para continuar.");
      return;
    }

    setLoading(true);
    try {
      const session = await login({ email: email.trim(), password });
      const isAdmin = session.user.roles.includes("admin");
      // Hard navigation: garante que o cookie httpOnly entre no próximo request
      // (router.push às vezes navega antes do browser gravar o Set-Cookie)
      const next =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const dest =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : isAdmin
            ? "/admin"
            : "/";
      window.location.assign(dest);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível entrar."
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 28 }}>
      {/* Logo (personalizável no Admin) */}
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

      {/* Título */}
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
          Bem-vindo(a)!
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Faça login na sua conta real (MySQL).
        </p>
      </div>

      {/* Form */}
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
              className="font-medium"
              style={{
                color: "var(--text-1)",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--danger, #ef4444)",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="auth-cta w-full font-semibold transition-opacity"
          style={{
            ...authButtonStyle,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      {/* Switch */}
      <p
        className="text-center"
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--text-2)",
        }}
      >
        Ainda não possui uma conta?{" "}
        <Link
          href="/registro"
          className="font-semibold"
          style={{
            color: "var(--text-1)",
            textDecoration: "none",
          }}
        >
          Crie agora
        </Link>
      </p>
    </div>
  );
}
