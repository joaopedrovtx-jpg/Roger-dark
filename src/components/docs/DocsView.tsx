"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Search } from "lucide-react";
import {
  DOCS_NAV,
  DOCS_SECTIONS,
  type DocSectionId,
  type HttpMethod,
} from "@/lib/docs/content";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ActiveGreenAccent } from "@/components/layout/ActiveGreenAccent";

/** Altura da barra verde (~3cm) thumb arrastável do menu */
const THUMB_H_PX = 114; // ≈ 3cm @ 96dpi
/** Mesma grossura da scrollbar nativa (globals.css ::-webkit-scrollbar) */
const THUMB_W_PX = 8;
/** Folga superior/inferior do thumb no menu */
const THUMB_PAD = 8;

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: "#38bdf8",
  POST: "#ffffff",
  PUT: "#f5a623",
  PATCH: "#f5a623",
  DELETE: "#ef4444",
};

/**
 * Spec visual (auditoria da referência Vizzion docs, ~1440 1600px)
 * ─────────────────────────────────────────────────────────────
 * Header h: 64px · padding X: 28px · border-bottom #1a1e26
 * Search: h 40 · max-w ~360 · radius 12 · bg #14181f · border #1f2430
 * Dashboard btn: h 36 38 · radius full · padding 0 18 · bg #00e676
 * Theme: 36×36 circle
 *
 * Sidebar w: 248px · pad 24/20 · group title 14/600 #fff · gap groups 28
 * Nav item: h 34 · pad 0 12 · radius 8 · font 14
 *
 * Content pad: 32 40 48 32 · max-w ~680 (center col)
 * H1: 32 34/700 #fff · tracking -0.03em · mt 8
 * Subtitle: 15 16/400 #8b93a3 · mt 10
 * Body: 15/400 #9aa3b2 · lh 1.7 · gap 16 · mt 24
 * H2: 22/650 #fff · mt 40 · tracking -0.02em
 * URL chip: h ~44 · radius 10 · bg #161a21 · pad 0 16 · mono 13.5
 *
 */

const T = {
  bg: "#0b0d11",
  surface: "#14181f",
  surface2: "#161a21",
  border: "#1f2430",
  borderSoft: "#1a1e26",
  green: "#ffffff",
  onGreen: "#0a0f0c",
  text1: "#ffffff",
  text2: "#9aa3b2",
  text3: "#8b93a3",
  textMuted: "#6d7585",
  navMuted: "#8b93a3",
} as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function InlineUrlBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="flex items-center gap-3 mt-4"
      style={{
        minHeight: 44,
        padding: "0 14px 0 16px",
        borderRadius: 10,
        background: T.surface2,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <code
        className="flex-1 truncate"
        style={{
          fontSize: 13.5,
          color: T.text2,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      >
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar URL"
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 28,
          height: 28,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: copied ? T.green : T.textMuted,
          cursor: "pointer",
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function CodeBlockView({ title, code }: { title?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  // URL-only single line → chip compacto (como na foto)
  const isUrlOnly =
    !code.includes("\n") &&
    (code.startsWith("http://") || code.startsWith("https://"));

  if (isUrlOnly) {
    return <InlineUrlBox url={code.trim()} />;
  }

  return (
    <div
      className="overflow-hidden mt-4"
      style={{
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: "#12151b",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3.5"
        style={{
          height: 38,
          borderBottom: `1px solid ${T.border}`,
          background: T.surface2,
        }}
      >
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>
          {title ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
          style={{
            border: "none",
            background: "transparent",
            color: copied ? T.green : T.textMuted,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre
        className="overflow-x-auto m-0 px-4 py-3.5 text-[13px] leading-[1.65]"
        style={{
          color: T.text2,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          whiteSpace: "pre",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocsView() {
  const [active, setActive] = useState<DocSectionId>("introducao");
  const [query, setQuery] = useState("");
  const section = DOCS_SECTIONS[active];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startY: number;
    startScroll: number;
  } | null>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const [dragging, setDragging] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, typeof DOCS_NAV>();
    for (const item of DOCS_NAV) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, []);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(([group, items]) => {
        const next = items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            group.toLowerCase().includes(q) ||
            DOCS_SECTIONS[i.id].title.toLowerCase().includes(q)
        );
        return [group, next] as const;
      })
      .filter(([, items]) => items.length > 0);
  }, [groups, query]);

  const syncThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    const scrollable = maxScroll > 2;
    setCanScroll(scrollable);
    if (!scrollable) {
      setThumbTop(0);
      return;
    }
    const track = Math.max(clientHeight - THUMB_H_PX - THUMB_PAD * 2, 1);
    setThumbTop((scrollTop / maxScroll) * track);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncThumb();
    el.addEventListener("scroll", syncThumb, { passive: true });
    window.addEventListener("resize", syncThumb);
    const ro = new ResizeObserver(syncThumb);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncThumb);
      window.removeEventListener("resize", syncThumb);
      ro.disconnect();
    };
  }, [syncThumb, filteredGroups]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("docs-search")?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      const el = scrollRef.current;
      if (!drag || !el) return;
      const { scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;
      const track = Math.max(clientHeight - THUMB_H_PX - THUMB_PAD * 2, 1);
      const delta = e.clientY - drag.startY;
      const next = Math.min(
        maxScroll,
        Math.max(0, drag.startScroll + (delta / track) * maxScroll)
      );
      el.scrollTop = next;
      // sync imediato (scroll event às vezes atrasa com pointer capture)
      setThumbTop(maxScroll > 0 ? (el.scrollTop / maxScroll) * track : 0);
    }

    function onUp() {
      dragRef.current = null;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 2) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = {
      startY: e.clientY,
      startScroll: el.scrollTop,
    };
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: T.bg,
        color: T.text1,
        height: "100vh",
        maxHeight: "100vh",
      }}
    >
      {/* ═══ HEADER 64px ═══ */}
      <header
        className="shrink-0 grid items-center"
        style={{
          height: 64,
          padding: "0 28px",
          borderBottom: `1px solid ${T.borderSoft}`,
          gridTemplateColumns: "1fr minmax(240px, 360px) 1fr",
          columnGap: 24,
        }}
      >
        <div className="flex items-center min-w-0 justify-self-start">
          <BrandLogo />
        </div>

        <label
          className="flex items-center gap-2 w-full justify-self-center"
          style={{
            height: 40,
            padding: "0 10px 0 14px",
            borderRadius: 12,
            background: T.surface,
            border: `1px solid ${T.border}`,
          }}
        >
          <Search size={15} strokeWidth={1.75} style={{ color: T.textMuted }} />
          <input
            id="docs-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="flex-1 bg-transparent outline-none"
            style={{
              color: T.text1,
              border: "none",
              fontSize: 13.5,
              fontWeight: 500,
            }}
          />
          <kbd
            className="hidden sm:inline-flex items-center"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: T.textMuted,
              background: "#1a1e26",
              borderRadius: 6,
              padding: "3px 7px",
              border: `1px solid ${T.border}`,
              lineHeight: 1,
            }}
          >
            Ctrl K
          </kbd>
        </label>

        <div className="flex items-center justify-end justify-self-end">
          <Link
            href="/"
            className="inline-flex items-center justify-center"
            style={{
              height: 36,
              padding: "0 18px",
              borderRadius: "var(--radius-md)",
              background: "#ffffff",
              color: T.onGreen,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* ═══ BODY: sidebar | content sem coluna “Nesta página” ═══ */}
      <div
        className="flex-1 grid min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: "248px minmax(0, 1fr)",
          height: "calc(100vh - 64px)",
        }}
      >
        {/*
          MENU LATERAL
          - área com altura limitada → overflow scroll funciona
          - thumb verde ~3cm: arrastar sobe/desce o MENU (não a página)
        */}
        <aside
          className="relative overflow-hidden min-h-0"
          style={{
            background: T.bg,
            borderRight: `1px solid ${T.borderSoft}`,
            height: "100%",
          }}
        >
          <div
            ref={scrollRef}
            id="docs-nav-scroll"
            className="docs-nav-scroll"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "24px 18px 40px 20px",
              // sem scrollbar nativa (evita trilho) só o thumb custom
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style>{`
              #docs-nav-scroll::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
                background: transparent !important;
              }
              #docs-nav-scroll::-webkit-scrollbar-track,
              #docs-nav-scroll::-webkit-scrollbar-thumb {
                display: none !important;
                background: transparent !important;
              }
            `}</style>
            {filteredGroups.map(([group, items]) => (
              <div key={group} style={{ marginBottom: 28 }}>
                <p
                  style={{
                    margin: "0 0 8px 12px",
                    fontSize: 14,
                    fontWeight: 650,
                    color: T.text1,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.3,
                  }}
                >
                  {group}
                </p>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  {items.map((item) => {
                    const isOn = item.id === active;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActive(item.id)}
                        className="relative text-left w-full flex items-center justify-between gap-2"
                        style={{
                          // tipografia/espaçamento iguais ao layout atual da docs
                          minHeight: 34,
                          padding: "0 12px",
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                          overflow: "hidden",
                          // fundo do selecionado + curva à esquerda (design anterior)
                          background: isOn
                            ? "var(--bg-card)"
                            : "transparent",
                          color: isOn ? T.green : T.navMuted,
                          fontSize: 14,
                          fontWeight: isOn ? 650 : 500,
                          lineHeight: 1.2,
                        }}
                        onMouseEnter={(e) => {
                          if (!isOn) {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.03)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isOn
                            ? "var(--bg-card)"
                            : "transparent";
                        }}
                      >
                        {isOn ? <ActiveGreenAccent color={T.green} /> : null}
                        <span className="relative z-[1] truncate">
                          {item.label}
                        </span>
                        {item.method ? (
                          <span
                            className="relative z-[1] shrink-0 tabular"
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.02em",
                              color: isOn
                                ? T.green
                                : METHOD_COLOR[item.method],
                              opacity: isOn ? 1 : 0.85,
                            }}
                          >
                            {item.method}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: T.textMuted,
                  paddingLeft: 12,
                }}
              >
                Nenhum resultado para “{query}”.
              </p>
            ) : null}
          </div>

          {/* Thumb verde ~3cm só rola o MENU LATERAL */}
          {/* Só o thumb sem trilho/fundo verde por trás */}
          <div
            data-thumb="1"
            role="scrollbar"
            aria-controls="docs-nav-scroll"
            aria-orientation="vertical"
            aria-valuenow={Math.round(thumbTop)}
            tabIndex={0}
            onPointerDown={startDrag}
            title={
              canScroll
                ? "Arraste para rolar o menu lateral"
                : "Menu sem overflow"
            }
            style={{
              position: "absolute",
              right: 2,
              top: THUMB_PAD + thumbTop,
              width: THUMB_W_PX,
              height: THUMB_H_PX,
              borderRadius: 99,
              background: T.green,
              zIndex: 6,
              cursor: canScroll
                ? dragging
                  ? "grabbing"
                  : "grab"
                : "default",
              touchAction: "none",
              opacity: canScroll ? 1 : 0.4,
              boxShadow: "none",
              outline: "none",
              border: "none",
              // sem glow / fundo extra ao arrastar
            }}
          />
        </aside>

        {/*
          CONTEÚDO DA PÁGINA (Introdução, Integração com IA, etc.)
          Scroll próprio: sobe/desce o texto da seção atual
        */}
        <main
          className="min-w-0 overflow-y-auto"
          style={{
            padding: "32px 40px 64px 32px",
            height: "100%",
          }}
        >
          <div style={{ maxWidth: 680 }}>
            {/* Categoria 14/600 green */}
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 650,
                color: T.green,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
              }}
            >
              {section.category}
            </p>

            {/* H1 + método HTTP quando for endpoint */}
            <div
              className="flex flex-wrap items-center gap-3"
              style={{ marginTop: 8 }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: 32,
                  fontWeight: 750,
                  color: T.text1,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                }}
              >
                {section.title}
              </h1>
              {section.method ? (
                <span
                  className="tabular font-bold"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    color: METHOD_COLOR[section.method],
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    padding: "4px 8px",
                  }}
                >
                  {section.method}
                  {section.path ? (
                    <span
                      style={{
                        color: T.text3,
                        fontWeight: 500,
                        marginLeft: 8,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                        letterSpacing: 0,
                      }}
                    >
                      {section.path}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>

            {/* Subtitle cinza um pouco mais grosso */}
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 15.5,
                fontWeight: 500,
                color: T.text3,
                lineHeight: 1.45,
              }}
            >
              {section.subtitle}
            </p>

            {/* Lead body cinza mais grosso */}
            <div
              className="flex flex-col"
              style={{ gap: 16, marginTop: 24 }}
            >
              {section.lead.map((p) => (
                <p
                  key={p.slice(0, 56)}
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 500,
                    color: T.text2,
                    lineHeight: 1.7,
                  }}
                >
                  {p}
                </p>
              ))}
            </div>

            {/* H2 sections */}
            {section.headings.map((h) => {
              const id = slugify(h.title);
              return (
                <section
                  key={h.title}
                  id={id}
                  style={{ marginTop: 40, scrollMarginTop: 24 }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 700,
                      color: T.text1,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.25,
                    }}
                  >
                    {h.title}
                  </h2>
                  <div
                    className="flex flex-col"
                    style={{ gap: 14, marginTop: 14 }}
                  >
                    {h.paragraphs.map((p) => (
                      <p
                        key={p.slice(0, 48)}
                        style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 500,
                          color: T.text2,
                          lineHeight: 1.7,
                        }}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                  {h.codes?.map((c) => (
                    <CodeBlockView
                      key={(c.title ?? "") + c.code.slice(0, 20)}
                      title={c.title}
                      code={c.code}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
