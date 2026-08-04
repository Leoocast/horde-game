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
  Ancient: "Ancestral",
  Agitator: "Agitador",
  Armorer: "Armero",
  Arboreal: "Arbóreo",
  Basilisk: "Basilisco",
  Bat: "Murciélago",
  Beast: "Bestia",
  Carrion: "Carroña",
  Caller: "Llamador",
  Chainfighter: "Giracadenas",
  Collector: "Recolector",
  Construct: "Constructo",
  Crew: "Cuadrilla",
  Crier: "Pregonero",
  Dinosaur: "Dinosaurio",
  Druid: "Druida",
  Elf: "Elfo",
  Rootfolk: "Habitante del bosque",
  Foreman: "Capataz",
  Gallowsborn: "Nacido del cadalso",
  Gatherer: "Recolector",
  Giant: "Gigante",
  Goblin: "Trasgo",
  Gunner: "Artillero",
  Human: "Humano",
  Hound: "Sabueso",
  Guardian: "Guardián",
  Keeper: "Custodio",
  Lizard: "Lagarto",
  Marshal: "Mariscal",
  Noble: "Noble",
  Packleader: "Líder de manada",
  Primordial: "Primordial",
  Rat: "Rata",
  Recruiter: "Reclutador",
  Runner: "Corredor",
  Sanctuary: "Santuario",
  Sentinel: "Vigía",
  Shaman: "Chamán",
  Shroudbearer: "Portador de mortaja",
  Spring: "Manantial",
  Warrior: "Guerrero",
  Wolfkin: "Lupino",
  Wizard: "Hechicero",
  Restorer: "Restauradora",
  Zombie: "Zombi",
};

export function localizedCardName(card: LocalizableCard | undefined, language: AppLanguage): string {
  if (!card) return "";
  const englishName = card.displayName ?? card.name ?? "";
  const localizedName = language === "es" ? card.displayNameEs?.trim() || englishName : englishName;
  return cardLabelCamelCase(localizedName, language);
}

export function localizedTypeLine(card: LocalizableCard, language: AppLanguage): string {
  const kinds = card.kinds ?? [];
  const subtypes = card.subtypes ?? [];
  const localizedSubtypes = language === "es" ? subtypes.map((subtype) => SPANISH_SUBTYPES[subtype] ?? subtype) : subtypes;
  return cardLabelCamelCase(
    canonicalCardKindLine(kinds, localizedSubtypes, language, card.isToken, card.modifiers ?? []),
    language,
  );
}

/** UI-facing "Camel Case": initial capitals per word while preserving spaces and authored names. */
export function cardLabelCamelCase(value: string, language: AppLanguage): string {
  return value.replace(
    /(^|[\s,;:()/-])(\p{L})/gu,
    (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase(language)}`,
  );
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
