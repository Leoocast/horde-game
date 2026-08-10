export type ExternalContentOrigin = "local" | "workshop";

export type ExternalContentManifest = Readonly<{
  schemaVersion: string;
  packId: string;
  revision: string;
}>;

export type ExternalDeckCandidate = Readonly<{
  label: string;
  raw: Record<string, unknown>;
  images: Record<string, unknown>;
  presentation: Record<string, unknown>;
}>;

export type ExternalContentPackCandidate = Readonly<{
  manifest: ExternalContentManifest;
  decks: readonly ExternalDeckCandidate[];
  assets: readonly string[];
}>;

export type ContentPolicyIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type ExternalCandidateShapeResult =
  | Readonly<{ ok: true; candidate: ExternalContentPackCandidate; issues: readonly [] }>
  | Readonly<{ ok: false; issues: readonly ContentPolicyIssue[] }>;

const TOP_LEVEL_KEYS = new Set(["manifest", "decks", "assets"]);
const MANIFEST_KEYS = new Set(["schemaVersion", "packId", "revision"]);
const DECK_ENTRY_KEYS = new Set(["label", "raw", "images", "presentation"]);

/** Parses only the transport shape. Security/content policy is intentionally a separate pass. */
export function validateExternalCandidateShape(input: unknown): ExternalCandidateShapeResult {
  const issues: ContentPolicyIssue[] = [];
  if (!isPlainRecord(input)) {
    return failure([issue("candidate_shape", "$", "Candidate must be a plain JSON object.")]);
  }
  reportUnknownKeys(input, TOP_LEVEL_KEYS, "$", issues);

  const manifest = input.manifest;
  if (!isPlainRecord(manifest)) {
    issues.push(issue("manifest_shape", "$.manifest", "manifest must be a plain JSON object."));
  } else {
    reportUnknownKeys(manifest, MANIFEST_KEYS, "$.manifest", issues);
    requireString(manifest, "schemaVersion", "$.manifest.schemaVersion", issues);
    requireString(manifest, "packId", "$.manifest.packId", issues);
    requireString(manifest, "revision", "$.manifest.revision", issues);
  }

  const rawDecks = input.decks;
  const decks: ExternalDeckCandidate[] = [];
  if (!Array.isArray(rawDecks)) {
    issues.push(issue("decks_shape", "$.decks", "decks must be an array."));
  } else {
    rawDecks.forEach((entry, index) => {
      const path = `$.decks[${index}]`;
      if (!isPlainRecord(entry)) {
        issues.push(issue("deck_shape", path, "Deck candidate must be a plain JSON object."));
        return;
      }
      reportUnknownKeys(entry, DECK_ENTRY_KEYS, path, issues);
      const label = requireString(entry, "label", `${path}.label`, issues);
      const raw = requireRecord(entry, "raw", `${path}.raw`, issues);
      const images = requireRecord(entry, "images", `${path}.images`, issues);
      const presentation = requireRecord(entry, "presentation", `${path}.presentation`, issues);
      if (label !== undefined && raw && images && presentation) {
        decks.push({ label, raw, images, presentation });
      }
    });
  }

  const assets = input.assets;
  if (!Array.isArray(assets) || assets.some((entry) => typeof entry !== "string")) {
    issues.push(issue("assets_shape", "$.assets", "assets must be an array of logical path strings."));
  }

  if (issues.length || !isPlainRecord(manifest) || !Array.isArray(rawDecks) || !Array.isArray(assets)) {
    return failure(issues);
  }

  return Object.freeze({
    ok: true as const,
    candidate: Object.freeze({
      manifest: Object.freeze({
        schemaVersion: manifest.schemaVersion as string,
        packId: manifest.packId as string,
        revision: manifest.revision as string,
      }),
      decks: Object.freeze(decks),
      assets: Object.freeze(assets as string[]),
    }),
    issues: Object.freeze([]) as readonly [],
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ContentPolicyIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue("unknown_field", `${path}.${key}`, `Field "${key}" is not allowed.`));
  }
}

function requireString(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentPolicyIssue[],
): string | undefined {
  const value = owner[key];
  if (typeof value === "string" && value.trim()) return value;
  issues.push(issue("required_string", path, `${key} must be a non-empty string.`));
  return undefined;
}

function requireRecord(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentPolicyIssue[],
): Record<string, unknown> | undefined {
  const value = owner[key];
  if (isPlainRecord(value)) return value;
  issues.push(issue("required_object", path, `${key} must be a plain JSON object.`));
  return undefined;
}

function issue(code: string, path: string, message: string): ContentPolicyIssue {
  return Object.freeze({ code, path, message });
}

function failure(issues: ContentPolicyIssue[]): ExternalCandidateShapeResult {
  return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
}
