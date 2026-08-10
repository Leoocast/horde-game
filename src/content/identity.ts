import type { ContentPackDescriptor } from "./contracts";

const ID_SEGMENT = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

export function assertContentIdentitySegment(value: string, label: string): void {
  if (!ID_SEGMENT.test(value)) {
    throw new Error(`${label} "${value}" is not a valid content identity segment.`);
  }
}

export function qualifiedDeckKey(packId: string, deckId: string): string {
  assertContentIdentitySegment(packId, "packId");
  assertContentIdentitySegment(deckId, "deckId");
  return `${packId}/${deckId}`;
}

export function qualifiedCardKey(packId: string, deckId: string, cardId: string): string {
  assertContentIdentitySegment(cardId, "cardId");
  return `${qualifiedDeckKey(packId, deckId)}/${cardId}`;
}

export function assertContentPackDescriptor(descriptor: ContentPackDescriptor): void {
  assertContentIdentitySegment(descriptor.packKey, "packKey");
  assertContentIdentitySegment(descriptor.packId, "packId");
  if (!descriptor.revision.trim()) throw new Error(`Content pack "${descriptor.packKey}" has no revision.`);
}
