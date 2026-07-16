/** Personalização visual da plataforma */

export const BRANDING_STORAGE_KEY = "darkpay.branding.v4";

/** Banner da Dashboard — imagem + nome + link opcional (clique redireciona) */
export interface BrandBanner {
  id: string;
  /** URL da imagem (path ou data URL) */
  imageUrl: string;
  /** Nome interno / legenda do banner */
  name: string;
  /** Link de destino ao clicar (vazio = sem redirecionamento) */
  linkUrl: string;
}

export interface PlatformBranding {
  /** Logo do painel e formulários de auth */
  logoUrl: string;
  /** Favicon / ícone da aba do navegador */
  faviconUrl: string;
  /**
   * Banners da Dashboard do seller.
   * 1 imagem = estático · 2+ = carrossel
   */
  banners: BrandBanner[];
  /**
   * Imagem do painel esquerdo:
   * login, registro, esqueci senha e criar nova senha (mesma)
   */
  authImageUrl: string;
}

export function createBannerId(): string {
  return `bn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createBanner(
  partial?: Partial<Pick<BrandBanner, "imageUrl" | "name" | "linkUrl">>
): BrandBanner {
  return {
    id: createBannerId(),
    imageUrl: partial?.imageUrl ?? "/banner-darkpay.jpg",
    name: partial?.name ?? "",
    linkUrl: partial?.linkUrl ?? "",
  };
}

export const DEFAULT_BRANDING: PlatformBranding = {
  logoUrl: "/logo-darkpay-header.png",
  faviconUrl: "/logo-darkpay-clean.jpg",
  banners: [
    {
      id: "bn_default",
      imageUrl: "/banner-darkpay.jpg",
      name: "Banner principal",
      linkUrl: "",
    },
  ],
  authImageUrl: "/banner-darkpay.jpg",
};

type LegacyBranding = Partial<PlatformBranding> & {
  bannerUrl?: string;
  /** legado v2/v3 — só URLs */
  bannerUrls?: Array<string | BrandBanner>;
};

function normalizeBannerItem(
  item: string | BrandBanner,
  index: number
): BrandBanner {
  if (typeof item === "string") {
    return {
      id: `bn_mig_${index}`,
      imageUrl: item,
      name: index === 0 ? "Banner principal" : `Banner ${index + 1}`,
      linkUrl: "",
    };
  }
  return {
    id: item.id || createBannerId(),
    imageUrl: item.imageUrl || "/banner-darkpay.jpg",
    name: item.name ?? "",
    linkUrl: item.linkUrl ?? "",
  };
}

function normalizeBanners(parsed: LegacyBranding): BrandBanner[] {
  if (Array.isArray(parsed.banners) && parsed.banners.length > 0) {
    return parsed.banners.map((b, i) => normalizeBannerItem(b as BrandBanner, i));
  }
  if (Array.isArray(parsed.bannerUrls) && parsed.bannerUrls.length > 0) {
    return parsed.bannerUrls.map((item, i) => normalizeBannerItem(item, i));
  }
  if (parsed.bannerUrl) {
    return [
      {
        id: "bn_mig_single",
        imageUrl: parsed.bannerUrl,
        name: "Banner principal",
        linkUrl: "",
      },
    ];
  }
  return DEFAULT_BRANDING.banners.map((b) => ({ ...b }));
}

export function cloneDefaultBranding(): PlatformBranding {
  return {
    ...DEFAULT_BRANDING,
    banners: DEFAULT_BRANDING.banners.map((b) => ({ ...b })),
  };
}

export function loadBranding(): PlatformBranding {
  if (typeof window === "undefined") return cloneDefaultBranding();
  try {
    const raw =
      window.localStorage.getItem(BRANDING_STORAGE_KEY) ||
      window.localStorage.getItem("darkpay.branding.v3") ||
      window.localStorage.getItem("darkpay.branding.v2") ||
      window.localStorage.getItem("darkpay.branding.v1");
    if (!raw) return cloneDefaultBranding();
    const parsed = JSON.parse(raw) as LegacyBranding;
    return {
      logoUrl: parsed.logoUrl || DEFAULT_BRANDING.logoUrl,
      faviconUrl: parsed.faviconUrl || DEFAULT_BRANDING.faviconUrl,
      banners: normalizeBanners(parsed),
      authImageUrl: parsed.authImageUrl || DEFAULT_BRANDING.authImageUrl,
    };
  } catch {
    return cloneDefaultBranding();
  }
}

export function saveBranding(branding: PlatformBranding): void {
  if (typeof window === "undefined") return;
  const payload: PlatformBranding = {
    ...branding,
    banners:
      branding.banners.length > 0
        ? branding.banners
        : cloneDefaultBranding().banners,
  };
  window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(
    new CustomEvent("darkpay:branding", { detail: payload })
  );
}

/** Aplica o favicon no <head> */
export function applyFavicon(url: string): void {
  if (typeof document === "undefined") return;
  const href = url || DEFAULT_BRANDING.faviconUrl;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = href.startsWith("data:") ? "image/png" : "image/x-icon";
  link.href = href;

  let apple = document.querySelector<HTMLLinkElement>(
    "link[rel='apple-touch-icon']"
  );
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);
  }
  apple.href = href;
}

/** Normaliza link (adiciona https:// se faltar protocolo) */
export function normalizeExternalUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return t;
  return `https://${t}`;
}

/** Lê arquivo de imagem como data URL (mock / preview local) */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler arquivo"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler"));
    reader.readAsDataURL(file);
  });
}
