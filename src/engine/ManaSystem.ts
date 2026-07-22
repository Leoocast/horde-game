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

export const STORED_MANA_CAP = 3;

export function storedManaSpace(game: GameState): number {
  return Math.max(0, STORED_MANA_CAP - game.player.manaPool.colorless - game.player.pendingStoredMana);
}

export function queueUnusedNormalMana(game: GameState): number {
  const availableSpace = storedManaSpace(game);
  if (availableSpace === 0) return 0;
  const unusedLands = game.player.battlefield.filter(
    (card) => card.cardTypes.includes("Land") && !card.tapped && !card.activatedThisTurn,
  ).length;
  const queued = Math.min(availableSpace, unusedLands);
  game.player.pendingStoredMana += queued;
  return queued;
}

export function releasePendingStoredMana(game: GameState): number {
  const released = Math.min(
    game.player.pendingStoredMana,
    Math.max(0, STORED_MANA_CAP - game.player.manaPool.colorless),
  );
  game.player.manaPool.colorless += released;
  game.player.pendingStoredMana = 0;
  return released;
}

export function addStoredMana(game: GameState, amount: number): number {
  const availableSpace = storedManaSpace(game);
  const added = Math.min(availableSpace, Math.max(0, amount));
  game.player.manaPool.colorless += added;
  return added;
}

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
  const coloredKeys = ["green", "red", "blue", "white", "black"] as const;
  const yellowNeededForColoredCosts = coloredKeys.reduce(
    (total, key) => total + Math.max(0, cost[key] - pool[key]),
    0,
  );
  if (yellowNeededForColoredCosts > pool.colorless) return false;
  const remaining = coloredKeys.reduce(
    (total, key) => total + Math.max(0, pool[key] - cost[key]),
    pool.colorless - yellowNeededForColoredCosts,
  );
  return remaining >= cost.colorless;
}

export function payMana(pool: ManaPool, cost: ManaPool): ManaPool {
  const next = { ...pool };
  for (const key of ["green", "red", "blue", "white", "black"] as const) {
    const matchingMana = Math.min(next[key], cost[key]);
    next[key] -= matchingMana;
    next.colorless -= cost[key] - matchingMana;
  }
  let generic = cost.colorless;
  for (const key of ["green", "red", "blue", "white", "black", "colorless"] as const) {
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

export function payManaAutomatically(game: GameState, cost: ManaPool): boolean {
  const storedMana = game.player.manaPool.colorless;
  const normalPool = { ...game.player.manaPool, colorless: 0 };
  if (canPay(normalPool, cost)) {
    game.player.manaPool = { ...payMana(normalPool, cost), colorless: storedMana };
    return true;
  }

  const availableSources = getAutomaticLandManaSources(game);
  const selected: typeof availableSources = [];
  let simulatedPool = normalPool;

  for (const source of availableSources) {
    const { produced } = source;
    selected.push(source);
    simulatedPool = addMana(simulatedPool, produced.color, produced.amount);
    if (canPay(simulatedPool, cost)) break;
  }

  const poolWithStoredMana = { ...simulatedPool, colorless: storedMana };
  if (!canPay(poolWithStoredMana, cost)) return false;

  for (const { card, produced } of selected) {
    card.tapped = true;
    card.activatedThisTurn = true;
    game.player.manaPool = addMana(game.player.manaPool, produced.color, produced.amount);
    game.log.unshift(`Player auto-taps ${card.name} for ${produced.amount} ${produced.color} mana.`);
  }
  game.player.manaPool = payMana(game.player.manaPool, cost);
  return true;
}

export function canPayWithAutomaticMana(game: GameState, cost: ManaPool): boolean {
  let simulatedPool = { ...game.player.manaPool };
  if (canPay(simulatedPool, cost)) return true;
  for (const { produced } of getAutomaticLandManaSources(game)) {
    simulatedPool = addMana(simulatedPool, produced.color, produced.amount);
    if (canPay(simulatedPool, cost)) return true;
  }
  return false;
}

function dynamicManaAmount(game: GameState, card: CardInstance): number {
  if (card.definitionId === "elvish_archdruid") {
    return game.player.battlefield.filter((item) => item.cardTypes.includes("Creature") && item.subtypes.includes("Elf")).length;
  }
  return getPowerToughness(game, card).power;
}

function getAutomaticMana(game: GameState, card: CardInstance): { color: Color | string; amount: number } | undefined {
  const ability = card.activatedAbilities.find(
    (item) => item.cost?.tap && (item.effect.type === "ADD_MANA" || item.effect.type === "ADD_MANA_DYNAMIC"),
  );
  if (!ability?.cost?.tap) return undefined;
  if (ability.effect.type === "ADD_MANA_DYNAMIC") {
    return { color: String(ability.effect.manaColor ?? "G"), amount: dynamicManaAmount(game, card) };
  }
  const mana = ability.effect.mana as Record<string, number> | undefined;
  const entry = mana ? Object.entries(mana)[0] : undefined;
  const color = entry?.[0] === "chosenColor" ? card.chosenColor ?? "G" : entry?.[0] ?? "G";
  const amount = entry?.[1] ?? Number(ability.effect.amount ?? 1);
  return { color, amount };
}

function getAutomaticLandManaSources(game: GameState): Array<{ card: CardInstance; produced: { color: Color | string; amount: number } }> {
  return game.player.battlefield
    // Creatures and other nonland permanents are tactical resources. They must be
    // activated explicitly so casting a spell never removes a potential attacker
    // or blocker without the player's consent.
    .filter((card) => card.cardTypes.includes("Land") && !card.tapped && !card.activatedThisTurn)
    .map((card) => ({ card, produced: getAutomaticMana(game, card) }))
    .filter((source): source is { card: CardInstance; produced: { color: Color | string; amount: number } } => Boolean(source.produced));
}

function addColor(pool: ManaPool, color: Color | string, amount: number): void {
  if (color === "G") pool.green += amount;
  else if (color === "R") pool.red += amount;
  else if (color === "U") pool.blue += amount;
  else if (color === "W") pool.white += amount;
  else if (color === "B") pool.black += amount;
  else pool.colorless += amount;
}
