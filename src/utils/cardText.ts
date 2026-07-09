import type { CardInstance } from "../engine/GameTypes";

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
