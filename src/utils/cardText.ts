import type { CardInstance } from "../engine/GameTypes";
import type { AppLanguage } from "../i18n/translations";

export function typeLine(card: CardInstance): string {
  return [...card.cardTypes, card.subtypes.length ? `- ${card.subtypes.join(" ")}` : ""].filter(Boolean).join(" ");
}

export function effectSummary(card: CardInstance): string {
  const effectNames = [
    ...card.effects.map((effect) => String(effect.type).replaceAll("_", " ")),
    ...card.activatedAbilities.map((ability) => ability.id.replaceAll("_", " ")),
  ];
  return effectNames.slice(0, 4).join(" · ");
}

export function gameEffectDescription(card: CardInstance, language: AppLanguage): string {
  const authored = card.gameText?.[language] ?? card.gameText?.en;
  if (authored) return authored;
  const summary = effectSummary(card);
  if (summary) return summary;
  return language === "es" ? "Sin efecto adicional." : "No additional effect.";
}
