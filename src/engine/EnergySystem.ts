import type { CardInstance, EnergyPool, GameState } from "./GameTypes";

export const STORED_ENERGY_CAP = 3;

export const emptyEnergyPool = (): EnergyPool => ({ available: 0, stored: 0 });

export function totalEnergyCost(printedCost = 0, xValue = 0): number {
  return Math.max(0, Number(printedCost) || 0) + Math.max(0, Number(xValue) || 0);
}

export function storedEnergySpace(game: GameState): number {
  return Math.max(0, STORED_ENERGY_CAP - game.player.energyPool.stored - game.player.pendingStoredEnergy);
}

export function queueUnusedNormalEnergy(game: GameState): number {
  const availableSpace = storedEnergySpace(game);
  if (availableSpace === 0) return 0;
  const unusedSources = game.player.field.filter(
    (card) => card.kinds.includes("SOURCE") && !card.exhausted && !card.activatedThisTurn,
  ).length;
  const queued = Math.min(availableSpace, unusedSources);
  game.player.pendingStoredEnergy += queued;
  return queued;
}

export function releasePendingStoredEnergy(game: GameState): number {
  const released = Math.min(
    game.player.pendingStoredEnergy,
    Math.max(0, STORED_ENERGY_CAP - game.player.energyPool.stored),
  );
  game.player.energyPool.stored += released;
  game.player.pendingStoredEnergy = 0;
  return released;
}

export function addStoredEnergy(game: GameState, amount: number): number {
  const added = Math.min(storedEnergySpace(game), Math.max(0, Number(amount) || 0));
  game.player.energyPool.stored += added;
  return added;
}

export function addAvailableEnergy(pool: EnergyPool, amount: number): EnergyPool {
  return { ...pool, available: pool.available + Math.max(0, Number(amount) || 0) };
}

export function canPayEnergy(pool: EnergyPool, cost: number): boolean {
  return pool.available + pool.stored >= Math.max(0, cost);
}

/** Available Energy is always spent before Stored Energy. */
export function payEnergy(pool: EnergyPool, cost: number): EnergyPool {
  let remaining = Math.max(0, cost);
  const availablePaid = Math.min(pool.available, remaining);
  remaining -= availablePaid;
  const storedPaid = Math.min(pool.stored, remaining);
  return {
    available: pool.available - availablePaid,
    stored: pool.stored - storedPaid,
  };
}

export function payEnergyAutomatically(game: GameState, cost: number): boolean {
  const normalizedCost = Math.max(0, cost);
  const startingStored = game.player.energyPool.stored;
  const availableOnly = { available: game.player.energyPool.available, stored: 0 };
  if (canPayEnergy(availableOnly, normalizedCost)) {
    game.player.energyPool = {
      ...payEnergy(availableOnly, normalizedCost),
      stored: startingStored,
    };
    return true;
  }

  const availableSources = getAutomaticEnergySources(game);
  const selected: typeof availableSources = [];
  let simulatedAvailable = availableOnly.available;
  for (const source of availableSources) {
    selected.push(source);
    simulatedAvailable += source.produced;
    if (simulatedAvailable >= normalizedCost) break;
  }

  if (simulatedAvailable + startingStored < normalizedCost) return false;

  for (const { card, produced } of selected) {
    card.exhausted = true;
    card.activatedThisTurn = true;
    game.player.energyPool = addAvailableEnergy(game.player.energyPool, produced);
    game.log.unshift(`Player auto-exhausts ${card.name} for ${produced} Energy.`);
  }
  game.player.energyPool = payEnergy(game.player.energyPool, normalizedCost);
  return true;
}

export function canPayWithAutomaticEnergy(game: GameState, cost: number): boolean {
  const normalizedCost = Math.max(0, cost);
  let available = game.player.energyPool.available + game.player.energyPool.stored;
  if (available >= normalizedCost) return true;
  for (const { produced } of getAutomaticEnergySources(game)) {
    available += produced;
    if (available >= normalizedCost) return true;
  }
  return false;
}

function getAutomaticEnergy(card: CardInstance): number | undefined {
  const ability = card.activatedAbilities.find((item) => item.cost?.exhaust && item.effect.type === "GAIN_ENERGY");
  if (!ability?.cost?.exhaust) return undefined;
  return Math.max(0, Number(ability.effect.amount ?? 1));
}

function getAutomaticEnergySources(game: GameState): Array<{ card: CardInstance; produced: number }> {
  return game.player.field
    // Echoes and other non-Source permanents are tactical resources. They must be activated
    // explicitly so casting a Spell never removes a potential attacker or defender.
    .filter((card) => card.kinds.includes("SOURCE") && !card.exhausted && !card.activatedThisTurn)
    .map((card) => ({ card, produced: getAutomaticEnergy(card) }))
    .filter((source): source is { card: CardInstance; produced: number } => source.produced !== undefined);
}
