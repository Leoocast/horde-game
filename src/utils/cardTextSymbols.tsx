import type { ReactNode } from "react";

export function renderCardText(text: string): ReactNode[] {
  const parts = text.split(/(\{\{?[A-Z0-9/]+\}?\})/g);
  return parts.map((part, index) => {
    const match = part.match(/^\{\{?([A-Z0-9/]+)\}?\}$/);
    if (!match) return part;
    return <SymbolLabel key={`${part}-${index}`} symbol={match[1]} />;
  });
}

export function cleanReminderText(text: string): string {
  return text
    .replace(/\s*\([^()]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function SymbolLabel({ symbol }: { symbol: string }) {
  if (symbol === "T") {
    return (
      <span className="mx-0.5 inline-flex items-center rounded-sm border border-stone-300 bg-stone-100 px-1 py-0.5 text-[10px] font-bold uppercase text-stone-600 align-middle">
        Tap
      </span>
    );
  }

  const colorClass =
    symbol === "G"
      ? "border-emerald-700 bg-emerald-600 text-white"
      : symbol === "R"
        ? "border-red-700 bg-red-600 text-white"
        : symbol === "U"
          ? "border-sky-700 bg-sky-600 text-white"
          : symbol === "W"
            ? "border-stone-400 bg-stone-50 text-stone-900"
            : symbol === "B"
              ? "border-stone-950 bg-stone-800 text-white"
              : "border-stone-400 bg-stone-200 text-stone-900";

  return (
    <span className={`mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none align-middle ${colorClass}`}>
      {symbol}
    </span>
  );
}
