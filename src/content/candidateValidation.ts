import type { ContentPackCandidate, ContentSource } from "./contracts";
import { assertContentIdentitySegment, assertContentPackDescriptor } from "./identity";

export function validateContentSourceCandidates(
  source: ContentSource,
  candidates: readonly ContentPackCandidate[],
): void {
  const packKeys = new Set<string>();
  for (const candidate of candidates) {
    assertContentPackDescriptor(candidate.descriptor);
    if (candidate.descriptor.origin !== source.origin) {
      throw new Error(
        `Content source "${source.sourceId}" cannot register origin "${candidate.descriptor.origin}".`,
      );
    }
    if (packKeys.has(candidate.descriptor.packKey)) {
      throw new Error(`Content source "${source.sourceId}" returned duplicate packKey "${candidate.descriptor.packKey}".`);
    }
    packKeys.add(candidate.descriptor.packKey);
    validateDeckCandidates(candidate);
  }
}

function validateDeckCandidates(candidate: ContentPackCandidate): void {
  if (candidate.decks.length === 0) {
    throw new Error(`Content pack "${candidate.descriptor.packKey}" contains no decks.`);
  }

  const deckIds = new Set<string>();
  for (const entry of candidate.decks) {
    assertContentIdentitySegment(entry.raw.id, "deckId");
    if (deckIds.has(entry.raw.id)) {
      throw new Error(`Content pack "${candidate.descriptor.packKey}" contains duplicate deck "${entry.raw.id}".`);
    }
    deckIds.add(entry.raw.id);
    if (!entry.label.trim()) throw new Error(`Deck "${entry.raw.id}" has no display label.`);
    if (!entry.raw.cards.length) throw new Error(`Deck "${entry.raw.id}" contains no cards.`);

    const cardIds = new Set<string>();
    for (const collection of [entry.raw.cards, entry.raw.tokens ?? []]) {
      const collectionIds = new Set<string>();
      for (const card of collection) {
        assertContentIdentitySegment(card.id, "cardId");
        if (collectionIds.has(card.id)) throw new Error(`Deck "${entry.raw.id}" contains duplicate card "${card.id}".`);
        collectionIds.add(card.id);
        cardIds.add(card.id);
      }
    }
    for (const cardId of cardIds) {
      if (!entry.images.cards[cardId]) {
        throw new Error(`Deck "${entry.raw.id}" has no image manifest entry for card "${cardId}".`);
      }
    }
    if (!cardIds.has(entry.presentation.keyCardId)) {
      throw new Error(`Deck "${entry.raw.id}" has an unknown key card "${entry.presentation.keyCardId}".`);
    }
  }
}
