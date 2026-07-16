export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatCompactK(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

export function formatChartDate(iso: string): string {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-");
  return `${d}/${m}/${y}`;
}

/** Rótulo do eixo X: hora (00h–23h) ou data dd/mm/yyyy */
export function formatChartLabel(
  iso: string,
  grain: "hour" | "day" = "day"
): string {
  if (grain === "hour") {
    // "2025-12-23T14:00" ou "2025-12-23T14:00:00"
    const time = iso.includes("T") ? iso.split("T")[1] : "";
    const hour = time.slice(0, 2) || "00";
    return `${hour}h`;
  }
  return formatChartDate(iso);
}
