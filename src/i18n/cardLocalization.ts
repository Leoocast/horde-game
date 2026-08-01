import type { AppLanguage } from "./translations";
import { canonicalCardTypeLine, traitVocabularyLabel, traitVocabularyTooltip } from "./gameVocabulary";

type LocalizableCard = {
  name?: string;
  displayName?: string;
  displayNameEs?: string | null;
  cardTypes?: string[];
  modifiers?: string[];
  subtypes?: string[];
  isToken?: boolean;
};

const SPANISH_SUBTYPES: Record<string, string> = {
  Aura: "Aura",
  Basilisk: "Basilisco",
  Bat: "Murciélago",
  Beast: "Bestia",
  Dinosaur: "Dinosaurio",
  Druid: "Druida",
  Elf: "Elfo",
  Forest: "Bosque",
  Giant: "Gigante",
  Goblin: "Trasgo",
  Human: "Humano",
  Lizard: "Lagarto",
  Noble: "Noble",
  Rat: "Rata",
  Sanctuary: "Santuario",
  Shaman: "Chamán",
  Warrior: "Guerrero",
  Wizard: "Hechicero",
  Zombie: "Zombi",
};

export function localizedCardName(card: LocalizableCard | undefined, language: AppLanguage): string {
  if (!card) return "";
  const englishName = card.displayName ?? card.name ?? "";
  return language === "es" ? card.displayNameEs?.trim() || englishName : englishName;
}

export function localizedTypeLine(card: LocalizableCard, language: AppLanguage): string {
  const cardTypes = card.cardTypes ?? [];
  const subtypes = card.subtypes ?? [];
  const localizedSubtypes = language === "es" ? subtypes.map((subtype) => SPANISH_SUBTYPES[subtype] ?? subtype) : subtypes;
  return canonicalCardTypeLine(cardTypes, localizedSubtypes, language, card.isToken, card.modifiers ?? []);
}

export function localizedKeywordLabel(keyword: string, language: AppLanguage): string {
  return traitVocabularyLabel(keyword, language).toLocaleUpperCase(language);
}

export function naturalCaseKeywordLabel(keyword: string): string {
  const lowerCaseKeyword = keyword.toLocaleLowerCase();
  return lowerCaseKeyword.charAt(0).toLocaleUpperCase() + lowerCaseKeyword.slice(1);
}

export function localizedKeywordTooltip(keyword: string, language: AppLanguage): string {
  return traitVocabularyTooltip(keyword, language);
}
