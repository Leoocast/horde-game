import type { AppLanguage } from "./translations";

type LocalizableCard = {
  name?: string;
  displayName?: string;
  displayNameEs?: string | null;
  cardTypes?: string[];
  subtypes?: string[];
};

const SPANISH_TYPES: Record<string, string> = {
  Artifact: "Artefacto",
  Basic: "Básica",
  Creature: "Criatura",
  Enchantment: "Encantamiento",
  Instant: "Instantáneo",
  Land: "Tierra",
  Legendary: "Legendaria",
  Planeswalker: "Planeswalker",
  Snow: "Nevada",
  Sorcery: "Conjuro",
  Token: "Ficha",
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
  Rat: "Rata",
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
  const types = language === "es" ? cardTypes.map((type) => SPANISH_TYPES[type] ?? type) : cardTypes;
  const localizedSubtypes = language === "es" ? subtypes.map((subtype) => SPANISH_SUBTYPES[subtype] ?? subtype) : subtypes;
  return [...types, localizedSubtypes.length ? `— ${localizedSubtypes.join(" ")}` : ""].filter(Boolean).join(" ");
}

export function localizedKeywordLabel(keyword: string, language: AppLanguage): string {
  if (language !== "es") return keyword;
  const text = keyword.trim();
  const toxic = text.match(/^TOXIC\s+\{(\d+)\}$/i);
  if (toxic) return `TÓXICO {${toxic[1]}}`;
  const labels: Record<string, string> = {
    DEATHTOUCH: "TOQUE MORTAL",
    FIRST_STRIKE: "DAÑAR PRIMERO",
    FLYING: "VOLAR",
    HASTE: "PRISA",
    HEXPROOF: "ANTIMALEFICIO",
    MENACE: "AMENAZA",
    REACH: "ALCANCE",
    SKULK: "ESCURRIDIZO",
    TRAMPLE: "ARROLLAR",
    VIGILANCE: "VIGILANCIA",
  };
  return labels[text.toUpperCase()] ?? text;
}

export function localizedKeywordTooltip(keyword: string, language: AppLanguage): string {
  const upper = keyword.trim().toUpperCase();
  if (language !== "es") {
    if (upper === "FLYING") return "Can only be blocked by creatures with flying or reach.";
    if (upper === "REACH") return "Can block creatures with flying.";
    if (upper === "VIGILANCE") return "Attacking does not tap this creature.";
    if (upper === "MENACE") return "This creature can only be blocked by two or more creatures.";
    if (upper === "DEATHTOUCH") return "Any damage this creature deals to another creature is lethal.";
    if (upper === "TRAMPLE") return "Excess combat damage can carry over to the defending side.";
    if (upper === "HASTE") return "Can attack and use tap abilities immediately.";
    if (upper === "SKULK") return "Can't be blocked by creatures with greater power.";
    if (upper.startsWith("TOXIC")) return "When this creature deals combat damage to the Horde, it adds poison counters.";
    return "Keyword ability.";
  }
  if (upper === "FLYING") return "Solo puede ser bloqueada por criaturas con volar o alcance.";
  if (upper === "REACH") return "Puede bloquear criaturas con volar.";
  if (upper === "VIGILANCE") return "Atacar no gira esta criatura.";
  if (upper === "MENACE") return "Esta criatura solo puede ser bloqueada por dos o más criaturas.";
  if (upper === "DEATHTOUCH") return "Cualquier daño que haga a otra criatura es letal.";
  if (upper === "TRAMPLE") return "El daño de combate sobrante puede pasar al bando defensor.";
  if (upper === "HASTE") return "Puede atacar y usar habilidades de girar inmediatamente.";
  if (upper === "SKULK") return "No puede ser bloqueada por criaturas con mayor fuerza.";
  if (upper.startsWith("TOXIC")) return "Cuando hace daño de combate a la Horda, añade contadores de veneno.";
  return "Habilidad de palabra clave.";
}
