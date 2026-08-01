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

const HOSTFALL_VALUE_BY_LEGACY_VALUE = Object.freeze({
  ANOTHER_CREATURE_YOU_CONTROL_DIED: "ANOTHER_ALLIED_ECHO_DIED",
  BEGIN_COMBAT: "BEGIN_BATTLE",
  BEGIN_UPKEEP: "BEGIN_READY",
  CARD_CAST: "CARD_PLAYED",
  CAST_CARD_IS_NON_TOKEN: "PLAYED_CARD_IS_NON_TOKEN",
  CREATURE_DIED: "ECHO_DIED",
  PERMANENT_DIED: "ECHO_DIED",
  DEAL_DAMAGE_TO_OPPONENT_CREATURE: "DEAL_DAMAGE_TO_OPPONENT_ECHO",
  DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT: "DEAL_DAMAGE_TO_RANDOM_OPPONENT_ECHO",
  EXILE_CARD_FROM_GRAVEYARD: "BANISH_CARD_FROM_MEMORY",
  GRAVEYARD_COUNT_AT_LEAST: "MEMORY_COUNT_AT_LEAST",
  GRAVEYARD_HAS_TOKEN_CREATURE_AND_NON_TOKEN_CREATURE: "MEMORY_HAS_TOKEN_ECHO_AND_NON_TOKEN_ECHO",
  HORDE_DIRECTIVE_ONLY: "HOST_DIRECTIVE_ONLY",
  IGNORED_FOR_HORDE_MVP: "IGNORED_FOR_HOST_MVP",
  LOWEST_EXCESS_MANA_THEN_LOWEST_TAP_PRIORITY: "LOWEST_EXCESS_ENERGY_THEN_LOWEST_EXHAUST_PRIORITY",
  LOWEST_MANA_VALUE_THEN_RANDOM: "LOWEST_ENERGY_COST_THEN_RANDOM",
  MILL_SELF: "DISCARD_OWN_ARCHIVE_TO_MEMORY",
  COUNT_PERMANENTS: "COUNT_ECHOS",
  COUNT_PERMANENTS_ENTERED_THIS_TURN: "COUNT_ECHOS_INVOKED_THIS_TURN",
  PLAYER_CHOOSES: "CHRONICLER_CHOOSES",
  RETURN_SELF_FROM_GRAVEYARD_TO_BATTLEFIELD: "RETURN_SELF_FROM_MEMORY_TO_FIELD",
  REVEAL_HORDE_ROUND: "REVEAL_HOST_ROUND",
  TAP_HORDE_CREATURES_FOR_MANA: "EXHAUST_HOST_ECHOS_FOR_ENERGY",
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

function legacyEnergyAmount(value) {
  if (typeof value === "number") return Math.max(0, value);
  if (typeof value !== "string") return value;
  return [...value.matchAll(/\{([^}]+)\}/gu)].reduce((total, match) => {
    const numeric = Number(match[1]);
    return total + (Number.isFinite(numeric) ? numeric : 1);
  }, 0);
}

function migrateNested(value) {
  if (typeof value === "string") return HOSTFALL_VALUE_BY_LEGACY_VALUE[value] ?? value;
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
    if (key === "keyword" && typeof nestedValue === "string") {
      migrated.keyword = hostfallTraits([nestedValue])[0] ?? nestedValue;
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
    if (key === "mana") {
      if (value.type === "ADD_MANA") {
        migrated.mana = migrateNested(nestedValue);
        continue;
      }
      migrated.energy = legacyEnergyAmount(nestedValue);
      continue;
    }
    if (key === "tapped") {
      migrated.exhausted = migrateNested(nestedValue);
      continue;
    }
    if (key === "permanentType" && typeof nestedValue === "string") {
      migrated.permanentKind = hostfallKinds([nestedValue])[0] ?? nestedValue;
      continue;
    }
    if (key === "controller" && nestedValue === "HORDE") {
      migrated.controller = "HOST";
      continue;
    }
    if (key === "damagePerMill") {
      migrated.damagePerArchiveDiscard = migrateNested(nestedValue);
      continue;
    }
    if (key === "poisonPerMill") {
      migrated.poisonPerArchiveDiscard = migrateNested(nestedValue);
      continue;
    }
    if (key === "hordeCreaturesHaveHaste") {
      migrated.hostEchosHaveImpetus = migrateNested(nestedValue);
      continue;
    }
    if (key === "requiredMana") {
      migrated.requiredEnergy = migrateNested(nestedValue);
      continue;
    }
    if (key === "hordeDirective") {
      migrated.hostDirective = migrateNested(nestedValue);
      continue;
    }
    if (key === "hordeErrata") {
      migrated.hostErrata = migrateNested(nestedValue);
      continue;
    }
    if (key === "hordeVersion") {
      migrated.hostVersion = migrateNested(nestedValue);
      continue;
    }
    if (key === "type" && nestedValue === "SOURCE_IS_UNTAPPED") {
      migrated.type = "SOURCE_IS_READY";
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
    if (key === "eventObject" && nestedValue === "permanent") {
      migrated.eventObject = "echo";
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
  if ((card.cardTypes ?? []).includes("Legendary") || (card.supertypes ?? []).includes("Legendary")) {
    modifiers.push("CHRONICLE");
  }

  const migrated = {};
  for (const [key, value] of Object.entries(card)) {
    if (key === "manaCost") {
      migrated.energyCost = { amount: Math.max(0, Number(card.manaValue ?? 0)) };
      continue;
    }
    if (["manaValue", "colors", "colorIdentity", "cardTypes", "keywords", "isToken", "supertypes"].includes(key)) continue;
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
  if (!migrated.energyCost) {
    migrated.energyCost = { amount: Math.max(0, Number(card.manaValue ?? 0)) };
  }
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
      migrated.schemaVersion = "1.0.0";
      continue;
    }
    if (key === "side") {
      migrated.side = String(value).toUpperCase() === "HORDE" ? "HOST" : "CHRONICLER";
      continue;
    }
    if ((key === "format" || key === "archetype") && value === "horde") {
      migrated[key] = "host";
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
console.log(`Migrado ${path.relative(process.cwd(), file)} a schema Hostfall 1.0.0.`);
