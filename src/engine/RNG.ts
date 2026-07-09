import type { GameState } from "./GameTypes";

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function nextRandom(state: number): [number, number] {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x >>> 0 || 1;
  return [next / 4294967296, next];
}

export function randomInt(game: GameState, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const [value, next] = nextRandom(game.currentRandomState);
  game.currentRandomState = next;
  return Math.floor(value * maxExclusive);
}

export function pickRandom<T>(game: GameState, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(game, items.length)];
}

export function shuffleWithState<T>(items: T[], randomState: number): { items: T[]; randomState: number } {
  const nextItems = [...items];
  let state = randomState;
  for (let i = nextItems.length - 1; i > 0; i -= 1) {
    const [value, next] = nextRandom(state);
    state = next;
    const j = Math.floor(value * (i + 1));
    [nextItems[i], nextItems[j]] = [nextItems[j], nextItems[i]];
  }
  return { items: nextItems, randomState: state };
}
