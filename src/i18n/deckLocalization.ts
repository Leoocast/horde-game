import type { AppLanguage } from "./translations";

type LocalizableDeck = {
  name: string;
  displayNameEn?: string | null;
};

/** Deck schema v1 keeps its Spanish identity in `name` and adds English explicitly. */
export function localizedDeckName(deck: LocalizableDeck | undefined, language: AppLanguage): string {
  if (!deck) return "";
  return (language === "en" ? deck.displayNameEn?.trim() || deck.name : deck.name).trim();
}
