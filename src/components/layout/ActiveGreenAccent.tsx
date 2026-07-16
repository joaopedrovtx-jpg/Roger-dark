/**
 * Curva verde do item selecionado no menu lateral (Dashboard e Docs).
 * C levemente aberta, mais grossa no meio, pontas afinadas.
 */
export function ActiveGreenAccent({
  color = "var(--green-use)",
}: {
  color?: string;
}) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-full"
      width={14}
      height="100%"
      viewBox="0 0 14 40"
      preserveAspectRatio="none"
      style={{ zIndex: 0 }}
    >
      <path
        d="
          M 9.6 1.0
          C 2.2 3.6 0.6 10.2 0.7 20
          C 0.6 29.8 2.2 36.4 9.6 39.0
          C 4.4 34.6 3.0 28.0 3.1 20
          C 3.0 12.0 4.4 5.4 9.6 1.0
          Z
        "
        fill={color}
      />
    </svg>
  );
}
