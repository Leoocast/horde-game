const CANON_SEED_GROUP_SIZE = 3;
export const CANON_SEED_COMPACT_LENGTH = 15;
export const CANON_SEED_FORMATTED_LENGTH = 19;

export function compactCanonSeedDraft(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CANON_SEED_COMPACT_LENGTH);
}

export function formatCanonSeedDraft(value: string): string {
  const compact = compactCanonSeedDraft(value);
  const groups: string[] = [];
  for (let index = 0; index < compact.length; index += CANON_SEED_GROUP_SIZE) {
    groups.push(compact.slice(index, index + CANON_SEED_GROUP_SIZE));
  }
  return groups.join("-");
}

export function canonSeedCharacterCount(value: string): number {
  return compactCanonSeedDraft(value).length;
}

export function formattedCanonSeedCaret(rawCharacterCount: number): number {
  const boundedCount = Math.max(0, Math.min(CANON_SEED_COMPACT_LENGTH, rawCharacterCount));
  if (boundedCount === 0) return 0;
  return boundedCount + Math.floor((boundedCount - 1) / CANON_SEED_GROUP_SIZE);
}

export function removeCanonSeedCharacter(value: string, rawCharacterIndex: number): string {
  const compact = compactCanonSeedDraft(value);
  if (rawCharacterIndex < 0 || rawCharacterIndex >= compact.length) return formatCanonSeedDraft(compact);
  return formatCanonSeedDraft(`${compact.slice(0, rawCharacterIndex)}${compact.slice(rawCharacterIndex + 1)}`);
}
