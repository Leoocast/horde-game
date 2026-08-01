import type { AppLanguage } from "./translations";
import { canonicalCardKindLine, traitVocabularyLabel, traitVocabularyTooltip } from "./gameVocabulary";

type LocalizableCard = {
  name?: string;
  displayName?: string;
  displayNameEs?: string | null;
  kinds?: string[];
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
  const kinds = card.kinds ?? [];
  const subtypes = card.subtypes ?? [];
  const localizedSubtypes = language === "es" ? subtypes.map((subtype) => SPANISH_SUBTYPES[subtype] ?? subtype) : subtypes;
  return canonicalCardKindLine(kinds, localizedSubtypes, language, card.isToken, card.modifiers ?? []);
}

export function localizedTraitLabel(keyword: string, language: AppLanguage): string {
  return traitVocabularyLabel(keyword, language).toLocaleUpperCase(language);
}

export function naturalCaseTraitLabel(keyword: string): string {
  const lowerCaseTrait = keyword.toLocaleLowerCase();
  return lowerCaseTrait.charAt(0).toLocaleUpperCase() + lowerCaseTrait.slice(1);
}

export function localizedTraitTooltip(keyword: string, language: AppLanguage): string {
  return traitVocabularyTooltip(keyword, language);
}
