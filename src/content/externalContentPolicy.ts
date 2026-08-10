import { HOSTFALL_DECK_SCHEMA_VERSION, isCardKind, isCardModifier, isTrait } from "../engine/hostfallVocabulary";
import { validateLogicalAssetPath } from "./AssetResolver";
import type { ContentPackDescriptor } from "./contracts";
import { assertContentIdentitySegment } from "./identity";
import {
  validateExternalCandidateShape,
  type ContentPolicyIssue,
  type ExternalContentOrigin,
  type ExternalContentPackCandidate,
} from "./externalCandidateValidation";

export const EXTERNAL_CONTENT_LIMITS = Object.freeze({
  serializedBytes: 2_000_000,
  decks: 16,
  cards: 500,
  abilitiesPerCard: 16,
  assets: 2_048,
  stringLength: 10_000,
});

const RASTER_ASSET_EXTENSION = /\.(?:png|jpe?g|webp)$/iu;
const REMOTE_OR_EXECUTABLE_URL = /^(?:https?|file|data|javascript|vbscript):/iu;
const FORBIDDEN_RUNTIME_KEYS = new Set([
  "customHandler",
  "engineSupport",
  "runtimeMarker",
  "nativeHandler",
  "script",
  "module",
  "code",
  "origin",
  "__proto__",
  "prototype",
  "constructor",
]);
const PUBLIC_ABILITY_KINDS = new Set(["STATIC", "TRIGGERED", "ACTIVATED", "SPELL"]);
const PUBLIC_EXTERNAL_EFFECT_TYPES = new Set([
  "ADD_COUNTERS",
  "CHOOSE",
  "CREATE_TOKEN",
  "DEAL_DAMAGE",
  "DEAL_DAMAGE_TO_TARGET",
  "DESTROY",
  "DESTROY_TARGET",
  "DRAW_CARD",
  "GAIN_ENERGY",
  "GAIN_LIFE",
  "GRANT_KEYWORD",
  "GRANT_KEYWORD_UNTIL_END_OF_TURN",
  "LOSE_LIFE",
  "MODIFY_STATS",
  "PUMP_UNTIL_NEXT_PLAYER_TURN",
  "PUT_COUNTER",
  "REMOVE_COUNTER",
  "SEQUENCE",
]);

export type ExternalContentPolicyResult =
  | Readonly<{
      ok: true;
      descriptor: ContentPackDescriptor;
      candidate: ExternalContentPackCandidate;
      issues: readonly [];
    }>
  | Readonly<{ ok: false; issues: readonly ContentPolicyIssue[] }>;

/**
 * Validates an already-parsed, in-memory external candidate. It never scans folders, loads code,
 * registers a source or trusts an origin declared by the candidate.
 */
export function validateExternalContentPolicy(
  input: unknown,
  assignedOrigin: ExternalContentOrigin,
): ExternalContentPolicyResult {
  const shape = validateExternalCandidateShape(input);
  if (!shape.ok) return shape;

  const { candidate } = shape;
  const issues: ContentPolicyIssue[] = [];
  validateSize(input, issues);
  validateManifest(candidate, issues);
  validateAssets(candidate, issues);
  validateDecks(candidate, issues);
  walkCandidate(candidate, "$", issues);

  if (issues.length) return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  const descriptor = Object.freeze({
    packKey: `${assignedOrigin}.${candidate.manifest.packId}`,
    packId: candidate.manifest.packId,
    origin: assignedOrigin,
    revision: candidate.manifest.revision,
  });
  return Object.freeze({ ok: true as const, descriptor, candidate, issues: Object.freeze([]) as readonly [] });
}

export function assertExternalContentPolicy(
  input: unknown,
  assignedOrigin: ExternalContentOrigin,
): Extract<ExternalContentPolicyResult, { ok: true }> {
  const result = validateExternalContentPolicy(input, assignedOrigin);
  if (!result.ok) {
    throw new Error(result.issues.map(({ path, message }) => `${path}: ${message}`).join("\n"));
  }
  return result;
}

function validateSize(input: unknown, issues: ContentPolicyIssue[]): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    issues.push(issue("not_json", "$", "Candidate must be serializable as JSON."));
    return;
  }
  if (new TextEncoder().encode(serialized).byteLength > EXTERNAL_CONTENT_LIMITS.serializedBytes) {
    issues.push(issue("pack_too_large", "$", "Candidate JSON exceeds the external content size limit."));
  }
}

function validateManifest(candidate: ExternalContentPackCandidate, issues: ContentPolicyIssue[]): void {
  const { manifest } = candidate;
  if (manifest.schemaVersion !== HOSTFALL_DECK_SCHEMA_VERSION) {
    issues.push(issue("schema_version", "$.manifest.schemaVersion", `Unsupported schema version "${manifest.schemaVersion}".`));
  }
  try {
    assertContentIdentitySegment(manifest.packId, "packId");
  } catch (error) {
    issues.push(issue("pack_id", "$.manifest.packId", error instanceof Error ? error.message : "Invalid packId."));
  }
  if (manifest.revision.length > 128) issues.push(issue("revision", "$.manifest.revision", "revision is too long."));
}

function validateAssets(candidate: ExternalContentPackCandidate, issues: ContentPolicyIssue[]): void {
  if (candidate.assets.length > EXTERNAL_CONTENT_LIMITS.assets) {
    issues.push(issue("asset_limit", "$.assets", "Candidate declares too many assets."));
  }
  const seen = new Set<string>();
  candidate.assets.forEach((assetPath, index) => {
    const path = `$.assets[${index}]`;
    if (seen.has(assetPath)) issues.push(issue("duplicate_asset", path, `Asset "${assetPath}" is duplicated.`));
    seen.add(assetPath);
    validateExternalAssetPath(assetPath, path, issues);
  });
}

function validateDecks(candidate: ExternalContentPackCandidate, issues: ContentPolicyIssue[]): void {
  if (candidate.decks.length === 0 || candidate.decks.length > EXTERNAL_CONTENT_LIMITS.decks) {
    issues.push(issue("deck_limit", "$.decks", "Candidate must contain between 1 and 16 decks."));
  }
  const deckIds = new Set<string>();
  const declaredAssets = new Set(candidate.assets);

  candidate.decks.forEach((entry, deckIndex) => {
    const path = `$.decks[${deckIndex}]`;
    const { raw, images, presentation } = entry;
    const deckId = raw.id;
    if (typeof deckId !== "string") {
      issues.push(issue("deck_id", `${path}.raw.id`, "Deck id must be a string."));
    } else {
      try {
        assertContentIdentitySegment(deckId, "deckId");
      } catch (error) {
        issues.push(issue("deck_id", `${path}.raw.id`, error instanceof Error ? error.message : "Invalid deckId."));
      }
      if (deckIds.has(deckId)) issues.push(issue("duplicate_deck", `${path}.raw.id`, `Deck "${deckId}" is duplicated.`));
      deckIds.add(deckId);
    }
    if (raw.schemaVersion !== HOSTFALL_DECK_SCHEMA_VERSION) {
      issues.push(issue("deck_schema", `${path}.raw.schemaVersion`, "Deck uses an unsupported schema version."));
    }
    if (raw.side !== "player" && raw.side !== "host") {
      issues.push(issue("deck_side", `${path}.raw.side`, "Deck side must be player or host."));
    }
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      issues.push(issue("deck_name", `${path}.raw.name`, "Deck name must be a non-empty string."));
    }

    const cards = Array.isArray(raw.cards) ? raw.cards : [];
    const tokens = Array.isArray(raw.tokens) ? raw.tokens : [];
    if (!Array.isArray(raw.cards)) issues.push(issue("cards_shape", `${path}.raw.cards`, "cards must be an array."));
    if (cards.length + tokens.length > EXTERNAL_CONTENT_LIMITS.cards) {
      issues.push(issue("card_limit", `${path}.raw`, "Deck declares too many cards and tokens."));
    }
    const cardIds = new Set<string>();
    [...cards, ...tokens].forEach((card, cardIndex) => {
      validateCard(card, `${path}.raw.allCards[${cardIndex}]`, cardIds, issues);
    });

    const imageCards = isRecord(images.cards) ? images.cards : undefined;
    if (!imageCards) {
      issues.push(issue("images_shape", `${path}.images.cards`, "images.cards must be an object."));
    } else {
      for (const cardId of cardIds) {
        const image = imageCards[cardId];
        const imagePath = `${path}.images.cards.${cardId}`;
        if (!isRecord(image) || image.source !== "local" || typeof image.imageUrl !== "string") {
          issues.push(issue("image_entry", imagePath, "Every card requires a local raster image entry."));
          continue;
        }
        validateExternalAssetPath(image.imageUrl, `${imagePath}.imageUrl`, issues);
        if (!declaredAssets.has(image.imageUrl)) {
          issues.push(issue("undeclared_asset", `${imagePath}.imageUrl`, `Asset "${image.imageUrl}" is not declared by the pack.`));
        }
      }
    }
    if (typeof presentation.keyCardId !== "string" || !cardIds.has(presentation.keyCardId)) {
      issues.push(issue("key_card", `${path}.presentation.keyCardId`, "Presentation keyCardId must reference a deck card."));
    }
  });
}

function validateCard(
  card: unknown,
  path: string,
  cardIds: Set<string>,
  issues: ContentPolicyIssue[],
): void {
  if (!isRecord(card)) {
    issues.push(issue("card_shape", path, "Card must be a JSON object."));
    return;
  }
  if (typeof card.id !== "string" || !card.id) {
    issues.push(issue("card_id", `${path}.id`, "Card id must be a non-empty string."));
  } else {
    try {
      assertContentIdentitySegment(card.id, "cardId");
    } catch (error) {
      issues.push(issue("card_id", `${path}.id`, error instanceof Error ? error.message : "Invalid cardId."));
    }
    if (cardIds.has(card.id)) issues.push(issue("duplicate_card", `${path}.id`, `Card "${card.id}" is duplicated.`));
    cardIds.add(card.id);
  }
  if (typeof card.name !== "string" || !card.name.trim()) issues.push(issue("card_name", `${path}.name`, "Card name is required."));
  if (!isRecord(card.flavorText) || typeof card.flavorText.en !== "string" || typeof card.flavorText.es !== "string") {
    issues.push(issue("flavor_text", `${path}.flavorText`, "Bilingual flavorText is required."));
  }
  if (typeof card.showFlavorText !== "boolean") {
    issues.push(issue("print_flag", `${path}.showFlavorText`, "showFlavorText must be boolean."));
  }
  validateVocabularyArray(card.kinds, isCardKind, `${path}.kinds`, issues);
  validateVocabularyArray(card.modifiers, isCardModifier, `${path}.modifiers`, issues);
  validateVocabularyArray(card.traits, isTrait, `${path}.traits`, issues);

  if (card.abilities !== undefined && !Array.isArray(card.abilities)) {
    issues.push(issue("abilities_shape", `${path}.abilities`, "abilities must be an array."));
    return;
  }
  const abilities = Array.isArray(card.abilities) ? card.abilities : [];
  if (abilities.length > EXTERNAL_CONTENT_LIMITS.abilitiesPerCard) {
    issues.push(issue("ability_limit", `${path}.abilities`, "Card declares too many abilities."));
  }
  abilities.forEach((ability, index) => validateAbility(ability, `${path}.abilities[${index}]`, issues));
}

function validateAbility(ability: unknown, path: string, issues: ContentPolicyIssue[]): void {
  if (!isRecord(ability)) {
    issues.push(issue("ability_shape", path, "Ability must be a JSON object."));
    return;
  }
  if (!PUBLIC_ABILITY_KINDS.has(String(ability.kind))) {
    issues.push(issue("ability_kind", `${path}.kind`, `Ability kind "${String(ability.kind)}" is not public.`));
  }
  const effects = Array.isArray(ability.effects) ? ability.effects : [];
  effects.forEach((effect, index) => validateEffect(effect, `${path}.effects[${index}]`, issues));
}

function validateEffect(effect: unknown, path: string, issues: ContentPolicyIssue[]): void {
  if (!isRecord(effect)) {
    issues.push(issue("effect_shape", path, "Effect must be a JSON object."));
    return;
  }
  if (!PUBLIC_EXTERNAL_EFFECT_TYPES.has(String(effect.type))) {
    issues.push(issue("effect_vocabulary", `${path}.type`, `Effect type "${String(effect.type)}" is not public.`));
  }
  if (Array.isArray(effect.effects)) {
    effect.effects.forEach((nested, index) => validateEffect(nested, `${path}.effects[${index}]`, issues));
  }
  if (isRecord(effect.effect)) validateEffect(effect.effect, `${path}.effect`, issues);
}

function validateVocabularyArray(
  value: unknown,
  predicate: (entry: unknown) => boolean,
  path: string,
  issues: ContentPolicyIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => !predicate(entry))) {
    issues.push(issue("public_vocabulary", path, "Value contains vocabulary that is not public."));
  }
}

function validateExternalAssetPath(assetPath: string, path: string, issues: ContentPolicyIssue[]): void {
  try {
    validateLogicalAssetPath(assetPath);
  } catch (error) {
    issues.push(issue("asset_path", path, error instanceof Error ? error.message : "Invalid asset path."));
    return;
  }
  if (!RASTER_ASSET_EXTENSION.test(assetPath)) {
    issues.push(issue("asset_type", path, "External assets must be PNG, JPEG or WebP raster images."));
  }
}

function walkCandidate(value: unknown, path: string, issues: ContentPolicyIssue[]): void {
  if (typeof value === "string") {
    if (value.length > EXTERNAL_CONTENT_LIMITS.stringLength) issues.push(issue("string_limit", path, "String exceeds the content limit."));
    if (value.includes("\0")) issues.push(issue("nul", path, "NUL characters are forbidden."));
    if (REMOTE_OR_EXECUTABLE_URL.test(value)) issues.push(issue("remote_url", path, "Remote, data and executable URLs are forbidden."));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((nested, index) => walkCandidate(nested, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_RUNTIME_KEYS.has(key)) {
      issues.push(issue("runtime_marker", `${path}.${key}`, `Runtime marker "${key}" is forbidden in external content.`));
    }
    walkCandidate(nested, `${path}.${key}`, issues);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): ContentPolicyIssue {
  return Object.freeze({ code, path, message });
}
