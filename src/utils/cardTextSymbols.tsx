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

export function cleanCardDescriptionText(oracleText?: string, flavorText?: string, keywords = "", fallbackText = ""): string {
  const cleanedOracle = stripKeywordOnlyLines(cleanReminderText(oracleText ?? ""), keywords);
  if (cleanedOracle) return cleanedOracle;
  const cleanedFlavor = cleanReminderText(flavorText ?? "");
  if (cleanedFlavor) return cleanedFlavor;
  return stripKeywordOnlyLines(cleanReminderText(fallbackText), keywords);
}

function stripKeywordOnlyLines(text: string, keywords: string): string {
  if (!text) return "";
  const keywordSet = new Set(
    keywords
      .split(",")
      .map((keyword) => normalizeKeywordLine(keyword))
      .filter(Boolean),
  );
  const baseKeywords = new Set(["FLYING", "REACH", "VIGILANCE", "MENACE", "DEATHTOUCH", "TRAMPLE", "HASTE", "HEXPROOF", "SKULK"]);
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => {
          const normalized = normalizeKeywordLine(line);
          if (!normalized) return false;
          return !baseKeywords.has(normalized) && !keywordSet.has(normalized);
        })
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  return blocks.join("\n\n").trim();
}

function normalizeKeywordLine(text: string): string {
  return text
    .replace(/\{(\d+)\}/g, "$1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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
