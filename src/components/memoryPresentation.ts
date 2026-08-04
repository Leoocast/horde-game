/** Game state appends cards to Memory chronologically; UI surfaces show the top (newest) first. */
export function memoryCardsNewestFirst<T>(cards: readonly T[]): T[] {
  return [...cards].reverse();
}

export function newestMemoryCard<T>(cards: readonly T[]): T | undefined {
  return cards[cards.length - 1];
}
