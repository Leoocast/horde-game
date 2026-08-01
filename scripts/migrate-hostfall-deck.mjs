import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const KIND_BY_LEGACY_TYPE = Object.freeze({
  Artifact: "SUPPORT",
  Creature: "ECHO",
  Enchantment: "SUPPORT",
  Energy: "SOURCE",
  Instant: "SPELL",
  Land: "SOURCE",
  Sorcery: "SPELL",
});

const TRAIT_BY_LEGACY_KEYWORD = Object.freeze({
  DEATHTOUCH: "LETHAL",
  FIRST_STRIKE: "REFLEX",
  HASTE: "IMPETUS",
  LIFESTEAL: "DRAIN",
  MENACE: "DAUNTING",
  REACH: "SKYGUARD",
  SKULK: "FURTIVE",
  TOXIC: "POISON",
  TRAMPLE: "OVERFLOW",
  VIGILANCE: "ALERT",
});

const ZONE_BY_LEGACY_ZONE = Object.freeze({
  BATTLEFIELD: "FIELD",
  EXILE: "OBLIVION",
  GRAVEYARD: "MEMORY",
  HAND: "HAND",
  LIBRARY: "ARCHIVE",
});

function unique(values) {
  return [...new Set(values)];
}

function hostfallKinds(cardTypes) {
  return unique((cardTypes ?? []).map((type) => KIND_BY_LEGACY_TYPE[type]).filter(Boolean));
}

function hostfallTraits(keywords) {
  return unique((keywords ?? []).map((keyword) => {
    const toxic = String(keyword).match(/^TOXIC_(\d+)$/u);
    if (toxic) return `POISON_${toxic[1]}`;
    return TRAIT_BY_LEGACY_KEYWORD[keyword] ?? keyword;
  }));
}

function migrateNested(value) {
  if (Array.isArray(value)) {
    const migratedItems = value
      .map(migrateNested)
      .filter((item) => !(item && typeof item === "object" && Array.isArray(item.kinds) && item.kinds.length === 0));
    return migratedItems.filter((item, index) => (
      migratedItems.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index
    ));
  }
  if (!value || typeof value !== "object") return value;

  const migrated = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "cardTypes") {
      migrated.kinds = hostfallKinds(nestedValue);
      continue;
    }
    if (key === "keywords") {
      migrated.traits = hostfallTraits(nestedValue);
      continue;
    }
    if (key === "toughness") {
      migrated.endurance = migrateNested(nestedValue);
      continue;
    }
    if (key === "tap") {
      migrated.exhaust = migrateNested(nestedValue);
      continue;
    }
    if (key === "requiresNoSummoningSickness") {
      migrated.requiresStabilized = migrateNested(nestedValue);
      continue;
    }
    if (key === "zone" && typeof nestedValue === "string") {
      migrated.zone = ZONE_BY_LEGACY_ZONE[nestedValue] ?? nestedValue;
      continue;
    }
    if (key === "event" && nestedValue === "ENTERS_BATTLEFIELD") {
      migrated.event = "INVOKED";
      continue;
    }
    if (key === "duration" && nestedValue === "WHILE_SOURCE_ON_BATTLEFIELD") {
      migrated.duration = "WHILE_SOURCE_ON_FIELD";
      continue;
    }
    if (key === "speed" && typeof nestedValue === "string") {
      migrated.speed = nestedValue === "INSTANT" ? "QUICK" : nestedValue === "SORCERY" ? "MAIN" : nestedValue;
      continue;
    }
    migrated[key] = migrateNested(nestedValue);
  }

  if (migrated.type === "ADD_MANA") {
    const amounts = Object.values(migrated.mana ?? {});
    const amount = amounts.reduce((total, item) => total + Number(item), 0);
    migrated.type = "GAIN_ENERGY";
    migrated.amount = amount || 1;
    delete migrated.mana;
  }
  return migrated;
}

function migrateAbility(ability) {
  const migrated = migrateNested(ability);
  if (ability.kind === "ACTIVATED") delete migrated.speed;
  if (ability.kind === "SPELL" && migrated.cost && typeof migrated.cost === "object") {
    delete migrated.cost.mana;
    if (Object.keys(migrated.cost).length === 0) delete migrated.cost;
  }
  return migrated;
}

function migrateCard(card) {
  const poisonTraits = (card.abilities ?? [])
    .map((ability) => String(ability.customHandler ?? "").match(/^toxic_(\d+)$/iu)?.[1])
    .filter(Boolean)
    .map((amount) => `POISON_${amount}`);
  const abilities = (card.abilities ?? []).filter((ability) => {
    const toxic = String(ability.customHandler ?? "").match(/^toxic_(\d+)$/iu);
    return !(ability.kind === "STATIC" && toxic && (ability.effects ?? []).length === 0);
  });
  const kinds = hostfallKinds(card.cardTypes);
  if (card.isToken) kinds.push("TOKEN");
  const modifiers = [];
  if ((card.cardTypes ?? []).includes("Instant")) modifiers.push("QUICK");

  const migrated = {};
  for (const [key, value] of Object.entries(card)) {
    if (key === "manaCost") {
      migrated.energyCost = { amount: Math.max(0, Number(card.manaValue ?? 0)) };
      continue;
    }
    if (["manaValue", "colors", "colorIdentity", "cardTypes", "keywords", "isToken"].includes(key)) continue;
    if (key === "toughness") {
      migrated.endurance = value;
      continue;
    }
    if (key === "abilities") {
      migrated.abilities = abilities.map(migrateAbility);
      continue;
    }
    migrated[key] = migrateNested(value);
  }
  migrated.kinds = unique(kinds);
  if (modifiers.length > 0) migrated.modifiers = modifiers;
  migrated.traits = unique([...hostfallTraits(card.keywords), ...poisonTraits]);
  return migrated;
}

function migrateDeck(deck) {
  if (deck.schemaVersion !== "0.2.0") {
    throw new Error(`Se esperaba schemaVersion 0.2.0; se recibió ${String(deck.schemaVersion)}.`);
  }
  const migrated = {};
  for (const [key, value] of Object.entries(deck)) {
    if (key === "schemaVersion") {
      migrated.schemaVersion = "0.3.0";
      continue;
    }
    if (key === "side") {
      migrated.side = value === "HORDE" ? "HOST" : "CHRONICLER";
      continue;
    }
    if (key === "colors") continue;
    if (key === "cards" || key === "tokens") {
      migrated[key] = value.map(migrateCard);
      continue;
    }
    migrated[key] = migrateNested(value);
  }
  return migrated;
}

const [input] = process.argv.slice(2);
if (!input) throw new Error("Uso: node scripts/migrate-hostfall-deck.mjs <deck.json>");
const file = path.resolve(input);
const deck = JSON.parse(fs.readFileSync(file, "utf8"));
const migrated = migrateDeck(deck);
fs.writeFileSync(file, `${JSON.stringify(migrated, null, 2)}\n`);
console.log(`Migrado ${path.relative(process.cwd(), file)} a schema Hostfall 0.3.0.`);
