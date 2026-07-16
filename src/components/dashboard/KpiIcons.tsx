/**
 * Ícones preenchidos (estilo flat/solid tipo Flaticon)
 * Real brasileiro: flaticon.com/br/icone-gratis/real-brasileiro_9382131
 * (Freepik) — free with attribution
 */

type IconTone = "white" | "black" | "yellow" | "red";

type IconProps = {
  size?: number;
  className?: string;
  color?: string;
  /** Cor do glyph no PNG Flaticon: white, black, yellow (pendente), red (recusado) */
  tone?: IconTone;
};

const base = {
  fill: "currentColor",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

/**
 * Filtro CSS: ícone preto Flaticon → branco do tema
 * brightness(0) zera a cor; invert(1) vira branco
 */
const filterWhite = "brightness(0) saturate(100%) invert(1)";
/** brightness(0) mantém o ícone preto */
const filterBlack = "brightness(0) saturate(100%)";
/** ≈ #f5a623 — amarelo status pendente */
const filterYellow =
  "brightness(0) saturate(100%) invert(72%) sepia(68%) saturate(1480%) hue-rotate(360deg) brightness(101%) contrast(96%)";
/** ≈ #ef4444 — vermelho status recusado */
const filterRed =
  "brightness(0) saturate(100%) invert(36%) sepia(86%) saturate(2476%) hue-rotate(338deg) brightness(98%) contrast(96%)";

function toneFilter(tone: IconTone): string {
  if (tone === "black") return filterBlack;
  if (tone === "yellow") return filterYellow;
  if (tone === "red") return filterRed;
  return filterWhite;
}

function FlaticonImg({
  src,
  size = 24,
  className,
  tone = "white",
}: {
  src: string;
  size?: number;
  className?: string;
  tone?: IconTone;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: toneFilter(tone),
        display: "block",
      }}
    />
  );
}

/**
 * Real brasileiro (Flaticon #9382131)
 * https://www.flaticon.com/br/icone-gratis/real-brasileiro_9382131
 */
export function IconRealBrasileiro({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/real-brasileiro.png"
      size={size}
      className={className}
    />
  );
}

/**
 * Símbolo do dólar (Flaticon #126179) — saldo disponível
 * https://www.flaticon.com/br/icone-gratis/simbolo-do-dolar_126179
 */
export function IconDolarSymbol({ size = 24, className, tone = "white" }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/dolar.png"
      size={size}
      className={className}
      tone={tone}
    />
  );
}

/**
 * Cadeado (Flaticon #45259) — saldo retido
 * https://www.flaticon.com/br/icone-gratis/simbolo-de-cadeado-para-interface-de-seguranca_45259
 */
export function IconLockFilled({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg src="/icons/cadeado.png" size={size} className={className} />
  );
}

/**
 * Sino (Flaticon #15767730) — notificações
 * https://www.flaticon.com/free-icon/bell_15767730
 */
export function IconBellFilled({ size = 24, className, tone = "white" }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/sino.png"
      size={size}
      className={className}
      tone={tone}
    />
  );
}

/**
 * Usuário / perfil (Flaticon #13464144)
 * https://www.flaticon.com/free-icon/user_13464144
 */
export function IconUserProfileFilled({
  size = 24,
  className,
  tone = "white",
}: IconProps) {
  return (
    <FlaticonImg
      src="/icons/usuario-perfil.png"
      size={size}
      className={className}
      tone={tone}
    />
  );
}

/**
 * Verificação em duas etapas / 2FA (Icons8 #37960)
 * https://img.icons8.com/?size=100&id=37960&format=png&color=000000
 */
export function Icon2FAFilled({
  size = 24,
  className,
  tone = "white",
}: IconProps) {
  return (
    <FlaticonImg
      src="/icons/verificacao-2fa.png"
      size={size}
      className={className}
      tone={tone}
    />
  );
}

/**
 * Dinheiro voando (Flaticon #4263415) — lucro líquido
 * https://www.flaticon.com/br/icone-gratis/dinheiro-voando_4263415
 */
export function IconMoneyFlying({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/dinheiro-voando.png"
      size={size}
      className={className}
    />
  );
}

/** Cifrão em círculo — fallback */
export function IconDollarFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 14.09V18h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V6h2.67v1.7c1.81.4 2.87 1.66 2.94 3.29h-1.97c-.05-.95-.56-1.75-2.26-1.75-1.5 0-2.24.66-2.24 1.47 0 .85.65 1.39 2.75 1.94 2.34.6 4.09 1.53 4.09 3.83 0 1.87-1.42 2.97-3.31 3.41z" />
    </svg>
  );
}

/** Relógio preenchido — saldo pendente / retido */
export function IconClockFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z" />
    </svg>
  );
}

/**
 * Transferência / setas (ícone original) — total de transações
 */
export function IconTransferFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
    </svg>
  );
}

/**
 * Desconto / porcentagem (Flaticon #16252897) — ticket médio
 * https://www.flaticon.com/br/icone-gratis/desconto_16252897
 */
export function IconPercentFilled({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/desconto-porcentagem.png"
      size={size}
      className={className}
    />
  );
}

/** Saída de dinheiro (seta para baixo em círculo) — total de saídas */
export function IconOutflowFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        fill="var(--bg-card-inner-icon)"
        d="M12 6.5a.9.9 0 0 1 .9.9v5.3l1.85-1.85a.9.9 0 1 1 1.27 1.27l-3.4 3.4a.9.9 0 0 1-1.27 0l-3.4-3.4a.9.9 0 1 1 1.27-1.27L11.1 12.7V7.4a.9.9 0 0 1 .9-.9z"
      />
    </svg>
  );
}

/**
 * PIX (Icons8 uqpbD9vhCDEQ) — recolorido verde do tema
 * https://img.icons8.com/?size=100&id=uqpbD9vhCDEQ&format=png&color=000000
 */
export function IconPixFilled({
  size = 24,
  className,
  tone = "white",
}: IconProps) {
  return (
    <FlaticonImg
      src="/icons/pix.png"
      size={size}
      className={className}
      tone={tone}
    />
  );
}

/**
 * Usuários / grupo (Icons8 #9542) — total de usuários
 * https://img.icons8.com/?size=100&id=9542&format=png&color=000000
 */
export function IconUsersFilled({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/usuarios.png"
      size={size}
      className={className}
    />
  );
}

/**
 * Gerente / CEO (Flaticon #2047262) — total de gerentes
 * https://www.flaticon.com/br/icone-gratis/ceo_2047262
 */
export function IconGerenteFilled({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/gerente.png"
      size={size}
      className={className}
    />
  );
}

/**
 * Documentos (Icons8 #23187) — Meus documentos / compliance
 * https://img.icons8.com/?size=100&id=23187&format=png&color=000000
 */
export function IconDocumentosFilled({ size = 24, className, tone = "white" }: IconProps) {
  return (
    <FlaticonImg
      src="/icons/documentos-perfil.png"
      tone={tone}
      size={size}
      className={className}
    />
  );
}

/** Banco / adquirentes */
export function IconBancoFilled({ size = 24, className }: IconProps) {
  return (
    <FlaticonImg src="/icons/banco.png" size={size} className={className} />
  );
}

/** Carteira preenchida — alternativa saldo */
export function IconWalletFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <path d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2H5z" />
      <circle cx="16" cy="12" r="1.5" />
    </svg>
  );
}

/** Check em círculo — vendas aprovadas */
export function IconCheckFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        fill="var(--bg-card-inner-icon)"
        d="M10.1 15.85a.9.9 0 0 1-1.27 0l-2.4-2.4a.9.9 0 1 1 1.27-1.27l1.76 1.76 5.1-5.1a.9.9 0 1 1 1.27 1.27l-5.73 5.74z"
      />
    </svg>
  );
}

/** X em círculo — vendas recusadas */
export function IconXFilled({
  size = 24,
  className,
  color = "var(--green-use)",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      aria-hidden
      {...base}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        fill="var(--bg-card-inner-icon)"
        d="M8.46 8.46a.9.9 0 0 1 1.27 0L12 10.73l2.27-2.27a.9.9 0 1 1 1.27 1.27L13.27 12l2.27 2.27a.9.9 0 1 1-1.27 1.27L12 13.27l-2.27 2.27a.9.9 0 1 1-1.27-1.27L10.73 12 8.46 9.73a.9.9 0 0 1 0-1.27z"
      />
    </svg>
  );
}
