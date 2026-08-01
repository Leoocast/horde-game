import type { CardInstance } from "./GameTypes";

const FLAG_PREFIX = "oncePerTurn:";

function flagName(key: string): string {
  return `${FLAG_PREFIX}${key}`;
}

export function hasUsedOncePerTurn(card: CardInstance, key: string): boolean {
  return card.flags[flagName(key)] === true;
}

export function markOncePerTurnUsed(card: CardInstance, key: string): void {
  card.flags[flagName(key)] = true;
}

export function resetOncePerTurnUsage(card: CardInstance): void {
  for (const key of Object.keys(card.flags)) {
    if (key.startsWith(FLAG_PREFIX)) delete card.flags[key];
  }
}
