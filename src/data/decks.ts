import type { CardDefinition, DeckList } from "../engine/GameTypes";
import {
  BUILTIN_PACK_DESCRIPTOR,
  DEFAULT_HOST_DECK_ID,
  DEFAULT_PLAYER_DECK_ID,
} from "../content/BuiltinContentSource";
import { contentCatalog } from "../content/bootstrap";
import type { ContentDeckRecord } from "../content/contracts";
import { qualifiedDeckKey } from "../content/identity";

export type DeckRegistryEntry = ContentDeckRecord;

/**
 * Compatibility facade for existing game/dev tooling. The source of truth is now the immutable
 * ContentCatalog; keep consumers on this export until qualified IDs are adopted end to end.
 */
export const DECK_REGISTRY: readonly DeckRegistryEntry[] = contentCatalog.decks;

export { DEFAULT_HOST_DECK_ID, DEFAULT_PLAYER_DECK_ID };

export const DEFAULT_PLAYER_DECK_KEY = qualifiedDeckKey(BUILTIN_PACK_DESCRIPTOR.packId, DEFAULT_PLAYER_DECK_ID);
export const DEFAULT_HOST_DECK_KEY = qualifiedDeckKey(BUILTIN_PACK_DESCRIPTOR.packId, DEFAULT_HOST_DECK_ID);

export const playerDeck = requireDeck(DEFAULT_PLAYER_DECK_KEY, "player");
export const hostDeck = requireDeck(DEFAULT_HOST_DECK_KEY, "host");

export function getPlayerDeck(id: string): DeckList {
  return requireDeck(id, "player");
}

export function getHostDeck(id: string): DeckList {
  return requireDeck(id, "host");
}

export const cardDefinitions: readonly CardDefinition[] = Object.freeze(
  DECK_REGISTRY.flatMap((entry) => [...(entry.deck.cards ?? []), ...(entry.deck.tokens ?? [])]),
);

export function findCardDefinition(id: string): CardDefinition | undefined {
  return contentCatalog.findDefinition(id);
}

function requireDeck(id: string, side: "player" | "host"): DeckList {
  return contentCatalog.requireDeck(id, side).deck;
}
