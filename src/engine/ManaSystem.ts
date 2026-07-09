import type { CardInstance, Color, GameState, ManaPool } from "./GameTypes";
import { getPowerToughness } from "./StaticEffects";

export const emptyManaPool = (): ManaPool => ({
  green: 0,
  red: 0,
  blue: 0,
  white: 0,
  black: 0,
  colorless: 0,
});

export function parseManaCost(cost = "", xValue = 0): ManaPool {
  const pool = emptyManaPool();
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  for (const symbol of symbols) {
    const value = symbol.replace(/[{}]/g, "");
    if (value === "X") pool.colorless += xValue;
    else if (/^\d+$/.test(value)) pool.colorless += Number(value);
    else addColor(pool, value as Color, 1);
  }
  return pool;
}

export function canPay(pool: ManaPool, cost: ManaPool): boolean {
  if (pool.green < cost.green || pool.red < cost.red || pool.blue < cost.blue || pool.white < cost.white || pool.black < cost.black) return false;
  const remaining =
    pool.green -
    cost.green +
    (pool.red - cost.red) +
    (pool.blue - cost.blue) +
    (pool.white - cost.white) +
    (pool.black - cost.black) +
    pool.colorless;
  return remaining >= cost.colorless;
}

export function payMana(pool: ManaPool, cost: ManaPool): ManaPool {
  const next = { ...pool };
  next.green -= cost.green;
  next.red -= cost.red;
  next.blue -= cost.blue;
  next.white -= cost.white;
  next.black -= cost.black;
  let generic = cost.colorless;
  for (const key of ["colorless", "green", "red", "blue", "white", "black"] as const) {
    const paid = Math.min(next[key], generic);
    next[key] -= paid;
    generic -= paid;
  }
  return next;
}

export function addMana(pool: ManaPool, color: Color | string, amount: number): ManaPool {
  const next = { ...pool };
  addColor(next, color, amount);
  return next;
}

export function payManaWithAvailableLands(game: GameState, cost: ManaPool): boolean {
  if (canPay(game.player.manaPool, cost)) {
    game.player.manaPool = payMana(game.player.manaPool, cost);
    return true;
  }

  const availableLands = game.player.battlefield.filter((card) => card.cardTypes.includes("Land") && !card.tapped && getStaticLandMana(card));
  const selected: CardInstance[] = [];
  let simulatedPool = { ...game.player.manaPool };

  for (const land of availableLands) {
    const produced = getStaticLandMana(land);
    if (!produced) continue;
    selected.push(land);
    simulatedPool = addMana(simulatedPool, produced.color, produced.amount);
    if (canPay(simulatedPool, cost)) break;
  }

  if (!canPay(simulatedPool, cost)) return false;

  for (const land of selected) {
    const produced = getStaticLandMana(land);
    if (!produced) continue;
    land.tapped = true;
    game.player.manaPool = addMana(game.player.manaPool, produced.color, produced.amount);
    game.log.unshift(`Player auto-taps ${land.name} for ${produced.amount} ${produced.color} mana.`);
  }
  game.player.manaPool = payMana(game.player.manaPool, cost);
  return true;
}

export function tapForMana(game: GameState, permanentId: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.battlefield.find((item) => item.instanceId === permanentId);
  if (!card || card.tapped) return log(next, "That permanent cannot be tapped for mana.");
  const ability = card.activatedAbilities.find((item) => item.effect.type === "ADD_MANA" || item.effect.type === "ADD_MANA_DYNAMIC");
  if (!ability) return log(next, `${card.name} has no mana ability.`);
  if (ability.cost?.tap && card.summoningSickness && card.cardTypes.includes("Creature")) return log(next, `${card.name} has summoning sickness.`);
  card.tapped = true;
  if (ability.effect.type === "ADD_MANA_DYNAMIC") {
    const amount = dynamicManaAmount(next, card);
    next.player.manaPool = addMana(next.player.manaPool, String(ability.effect.manaColor ?? "G"), amount);
    return log(next, `Player taps ${card.name} for ${amount} green mana.`);
  }
  const mana = ability.effect.mana as Record<string, number> | undefined;
  const entry = mana ? Object.entries(mana)[0] : undefined;
  const color = entry?.[0] === "chosenColor" ? card.chosenColor ?? "G" : entry?.[0] ?? "G";
  const amount = entry?.[1] ?? Number(ability.effect.amount ?? 1);
  next.player.manaPool = addMana(next.player.manaPool, color, amount);
  return log(next, `Player taps ${card.name} for ${amount} ${color} mana.`);
}

function dynamicManaAmount(game: GameState, card: CardInstance): number {
  if (card.definitionId === "elvish_archdruid") {
    return game.player.battlefield.filter((item) => item.cardTypes.includes("Creature") && item.subtypes.includes("Elf")).length;
  }
  return getPowerToughness(game, card).power;
}

function getStaticLandMana(card: CardInstance): { color: Color | string; amount: number } | undefined {
  const ability = card.activatedAbilities.find((item) => item.effect.type === "ADD_MANA");
  if (!ability?.cost?.tap) return undefined;
  const mana = ability.effect.mana as Record<string, number> | undefined;
  const entry = mana ? Object.entries(mana)[0] : undefined;
  const color = entry?.[0] === "chosenColor" ? card.chosenColor ?? "G" : entry?.[0] ?? "G";
  const amount = entry?.[1] ?? Number(ability.effect.amount ?? 1);
  return { color, amount };
}

function addColor(pool: ManaPool, color: Color | string, amount: number): void {
  if (color === "G") pool.green += amount;
  else if (color === "R") pool.red += amount;
  else if (color === "U") pool.blue += amount;
  else if (color === "W") pool.white += amount;
  else if (color === "B") pool.black += amount;
  else pool.colorless += amount;
}

function log(game: GameState, message: string): GameState {
  game.log.unshift(message);
  return game;
}
