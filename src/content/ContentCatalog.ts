import type { CardDefinition, Side } from "../engine/GameTypes";
import { normalizeDeck } from "../data/normalizeDeck";
import { validateContentSourceCandidates } from "./candidateValidation";
import type {
  ContentDeckRecord,
  ContentDefinitionRecord,
  ContentPackDescriptor,
  ContentSource,
} from "./contracts";
import { qualifiedCardKey, qualifiedDeckKey } from "./identity";

export type ActiveContentSource = Readonly<{
  sourceId: string;
  origin: ContentSource["origin"];
}>;

/** Immutable snapshot of every content source loaded for one application boot. */
export class ContentCatalog {
  readonly revision: string;
  readonly packs: readonly ContentPackDescriptor[];
  readonly decks: readonly ContentDeckRecord[];
  readonly definitions: readonly ContentDefinitionRecord[];
  readonly activeSources: readonly ActiveContentSource[];

  readonly #decksByKey: ReadonlyMap<string, ContentDeckRecord>;
  readonly #definitionsByKey: ReadonlyMap<string, ContentDefinitionRecord>;

  constructor(sources: readonly ContentSource[]) {
    if (sources.length === 0) throw new Error("A content catalog requires at least one source.");

    const packs: ContentPackDescriptor[] = [];
    const decks: ContentDeckRecord[] = [];
    const definitions: ContentDefinitionRecord[] = [];
    const definitionKeys = new Set<string>();
    const packKeys = new Set<string>();
    const packIds = new Set<string>();

    for (const source of sources) {
      const candidates = source.loadCandidates();
      validateContentSourceCandidates(source, candidates);
      for (const candidate of candidates) {
        const { descriptor } = candidate;
        if (packKeys.has(descriptor.packKey)) throw new Error(`Duplicate runtime packKey "${descriptor.packKey}".`);
        if (packIds.has(descriptor.packId)) throw new Error(`Duplicate canonical packId "${descriptor.packId}".`);
        packKeys.add(descriptor.packKey);
        packIds.add(descriptor.packId);
        packs.push(deepFreeze({ ...descriptor }));

        for (const candidateDeck of candidate.decks) {
          const deck = normalizeDeck(candidateDeck.raw);
          const deckKey = qualifiedDeckKey(descriptor.packId, deck.id);
          const record = deepFreeze({
            ...candidateDeck,
            deck,
            packKey: descriptor.packKey,
            packId: descriptor.packId,
            origin: descriptor.origin,
            revision: descriptor.revision,
            qualifiedDeckKey: deckKey,
          }) satisfies ContentDeckRecord;
          decks.push(record);

          for (const definition of [...(deck.cards ?? []), ...(deck.tokens ?? [])]) {
            const definitionKey = qualifiedCardKey(descriptor.packId, deck.id, definition.id);
            // A builtin may author the same printed identity in cards and tokens (Varka's Minion).
            // The deck retains both runtime entries; the identity catalog exposes one canonical record.
            if (definitionKeys.has(definitionKey)) continue;
            definitionKeys.add(definitionKey);
            definitions.push(deepFreeze({
              definition,
              packKey: descriptor.packKey,
              packId: descriptor.packId,
              origin: descriptor.origin,
              revision: descriptor.revision,
              deckId: deck.id,
              qualifiedDeckKey: deckKey,
              qualifiedCardKey: definitionKey,
            }));
          }
        }
      }
    }

    this.packs = Object.freeze(packs);
    this.decks = Object.freeze(decks);
    this.definitions = Object.freeze(definitions);
    this.activeSources = Object.freeze(sources.map(({ sourceId, origin }) => Object.freeze({ sourceId, origin })));
    this.revision = packs.map(({ packKey, revision }) => `${packKey}@${revision}`).join("+");
    this.#decksByKey = indexWithUnambiguousAliases(
      decks,
      (entry) => entry.qualifiedDeckKey,
      (entry) => entry.deck.id,
    );
    this.#definitionsByKey = indexWithUnambiguousAliases(
      definitions,
      (entry) => entry.qualifiedCardKey,
      (entry) => entry.definition.id,
    );
    Object.freeze(this);
  }

  findDeck(key: string): ContentDeckRecord | undefined {
    return this.#decksByKey.get(key);
  }

  requireDeck(key: string, side?: Side): ContentDeckRecord {
    const entry = this.findDeck(key);
    if (!entry) throw new Error(`Deck "${key}" is not registered.`);
    if (side && entry.deck.side !== side) {
      throw new Error(`Deck "${key}" belongs to side "${entry.deck.side}", not "${side}".`);
    }
    return entry;
  }

  findDefinition(key: string): CardDefinition | undefined {
    return this.findDefinitionRecord(key)?.definition;
  }

  findDefinitionRecord(key: string): ContentDefinitionRecord | undefined {
    return this.#definitionsByKey.get(key);
  }

  decksForSide(side: Side): readonly ContentDeckRecord[] {
    return Object.freeze(this.decks.filter((entry) => entry.deck.side === side));
  }
}

function indexWithUnambiguousAliases<T>(
  entries: readonly T[],
  qualifiedKeyFor: (entry: T) => string,
  legacyAliasFor: (entry: T) => string,
): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  const ambiguousAliases = new Set<string>();
  for (const entry of entries) {
    const qualified = qualifiedKeyFor(entry);
    if (index.has(qualified)) throw new Error(`Duplicate qualified content key "${qualified}".`);
    index.set(qualified, entry);

    const alias = legacyAliasFor(entry);
    if (ambiguousAliases.has(alias)) continue;
    if (index.has(alias)) {
      index.delete(alias);
      ambiguousAliases.add(alias);
    } else {
      index.set(alias, entry);
    }
  }
  return index;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
