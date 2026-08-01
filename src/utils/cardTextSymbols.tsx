import type { ReactNode } from "react";
import { useLanguageStore } from "../store/useLanguageStore";

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

export function cleanCardDescriptionText(oracleText?: string, flavorText?: string, traits = "", fallbackText = ""): string {
  const cleanedOracle = stripTraitOnlyLines(cleanReminderText(oracleText ?? ""), traits);
  if (cleanedOracle) return cleanedOracle;
  const cleanedFlavor = cleanReminderText(flavorText ?? "");
  if (cleanedFlavor) return cleanedFlavor;
  return stripTraitOnlyLines(cleanReminderText(fallbackText), traits);
}

function stripTraitOnlyLines(text: string, traits: string): string {
  if (!text) return "";
  const keywordSet = new Set(
    traits
      .split(",")
      .map((keyword) => normalizeTraitLine(keyword))
      .filter(Boolean),
  );
  const baseTraits = new Set([
    "FLYING", "SKYGUARD", "ALERT", "DAUNTING", "LETHAL", "OVERFLOW", "IMPETUS", "HEXPROOF", "FURTIVE", "DRAIN",
    "SKYGUARD", "ALERT", "DAUNTING", "LETHAL", "REFLEX", "FURTIVE", "DRAIN", "OVERFLOW", "IMPETUS", "POISON 1",
    "GUARDIA AÉREA", "ALERTA", "IMPONENTE", "LETAL", "REFLEJOS", "FURTIVO", "DRENAR", "DESBORDE", "ÍMPETU", "VENENO 1",
    "VOLAR", "ANTIMALEFICIO",
  ]);
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => {
          const normalized = normalizeTraitLine(line);
          if (!normalized) return false;
          return !isTraitOnlyLine(normalized, keywordSet, baseTraits);
        })
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  return blocks.join("\n\n").trim();
}

function isTraitOnlyLine(normalizedLine: string, keywordSet: Set<string>, baseTraits: Set<string>): boolean {
  const knownTraits = new Set([...baseTraits, ...keywordSet]);
  if (knownTraits.has(normalizedLine)) return true;

  // Imported rule text can combine multiple Traits on one line. They already have their own
  // badges, so the whole line is redundant when every item is a known Trait.
  const parts = normalizedLine
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every((part) => knownTraits.has(part));
}

function normalizeTraitLine(text: string): string {
  return text
    .replace(/\{(\d+)\}/g, "$1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function SymbolLabel({ symbol }: { symbol: string }) {
  const language = useLanguageStore((state) => state.language);
  if (symbol === "T") {
    return (
      <span className="mx-0.5 inline-flex items-center rounded-sm border border-stone-300 bg-stone-100 px-1 py-0.5 text-[10px] font-bold uppercase text-stone-600 align-middle">
        {language === "es" ? "Agotar" : "Exhaust"}
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
