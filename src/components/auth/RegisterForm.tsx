"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Lock, Mail, Phone, User } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  BrandLoadingScreen,
  waitBrandLoadingMin,
} from "@/components/layout/BrandLoadingScreen";
import { AuthInput, authButtonStyle } from "./AuthInput";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

/** Máscara simples de telefone BR: (11) 9 9999-9999 */
function formatPhone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

export function RegisterForm() {
  const { branding } = useBranding();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirm) {
      setError("Preencha todos os campos para continuar.");
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
    if (!accepted) {
      setError("Aceite os Termos de uso e a Política de Privacidade.");
      return;
    }

    if (!turnstileToken) {
      setError("Resolva a verificação de segurança.");
      return;
    }

    setLoading(true);
    const startedAt = Date.now();
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        turnstileToken,
      });
      // Logo pulsando no mínimo 2s antes de entrar
      await waitBrandLoadingMin(startedAt);
      window.location.assign("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível criar a conta."
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {loading ? <BrandLoadingScreen label="Criando conta…" /> : null}

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
          Crie sua conta
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Preencha os dados abaixo para começar
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 14 }}
        noValidate
      >
        <AuthInput
          label="Nome completo"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon={<User size={18} strokeWidth={1.8} />}
        />

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

        <AuthInput
          label="Telefone (WhatsApp)"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="(11) 9 9999-9999"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          icon={<Phone size={18} strokeWidth={1.8} />}
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

        {/* Termos */}
        <label
          className="flex items-start gap-2.5 cursor-pointer"
          style={{ marginTop: 2 }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{
              marginTop: 3,
              width: 16,
              height: 16,
              accentColor: "#ffffff",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12.5,
              lineHeight: 1.45,
              color: "var(--text-2)",
            }}
          >
            Ao continuar você concorda com nossos{" "}
            <Link
              href="/docs"
              style={{ color: "var(--text-1)", fontWeight: 600 }}
            >
              Termos de uso
            </Link>{" "}
            e{" "}
            <Link
              href="/docs"
              style={{ color: "var(--text-1)", fontWeight: 600 }}
            >
              Política de Privacidade
            </Link>
          </span>
        </label>

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

        <div className="flex justify-center">
          <TurnstileWidget onToken={setTurnstileToken} />
        </div>

        <button
          type="submit"
          disabled={loading || !turnstileToken}
          className="auth-cta w-full font-semibold transition-opacity"
          style={{
            ...authButtonStyle,
            marginTop: 2,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Criando conta…" : "Criar minha conta"}
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
        Já tenho conta?{" "}
        <Link
          href="/login"
          className="font-semibold"
          style={{
            color: "var(--text-1)",
            textDecoration: "none",
          }}
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
