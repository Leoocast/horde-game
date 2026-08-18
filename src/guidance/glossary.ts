import type { TranslationKey } from "../i18n/translations";
import type { GuidedGlossaryTermId } from "./contracts";

type GuidedGlossaryEntry = Readonly<{
  labelKey: TranslationKey;
  definitionKey: TranslationKey;
}>;

export type GuidedGlossarySegment =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "term"; text: string; termId: GuidedGlossaryTermId; definition: string }>;

type Translate = (key: TranslationKey) => string;

export const GUIDED_GLOSSARY = {
  host: { labelKey: "guided.glossary.host.label", definitionKey: "guided.glossary.host.definition" },
  archive: { labelKey: "guided.glossary.archive.label", definitionKey: "guided.glossary.archive.definition" },
  life: { labelKey: "guided.glossary.life.label", definitionKey: "guided.glossary.life.definition" },
  preparation: { labelKey: "guided.glossary.preparation.label", definitionKey: "guided.glossary.preparation.definition" },
  field: { labelKey: "guided.glossary.field.label", definitionKey: "guided.glossary.field.definition" },
  hand: { labelKey: "guided.glossary.hand.label", definitionKey: "guided.glossary.hand.definition" },
  echoes: { labelKey: "guided.glossary.echoes.label", definitionKey: "guided.glossary.echoes.definition" },
  source: { labelKey: "guided.glossary.source.label", definitionKey: "guided.glossary.source.definition" },
  energy: { labelKey: "guided.glossary.energy.label", definitionKey: "guided.glossary.energy.definition" },
  sourceAction: { labelKey: "guided.glossary.sourceAction.label", definitionKey: "guided.glossary.sourceAction.definition" },
  invoke: { labelKey: "guided.glossary.invoke.label", definitionKey: "guided.glossary.invoke.definition" },
  action: { labelKey: "guided.glossary.action.label", definitionKey: "guided.glossary.action.definition" },
  exhausted: { labelKey: "guided.glossary.exhausted.label", definitionKey: "guided.glossary.exhausted.definition" },
  stabilizing: { labelKey: "guided.glossary.stabilizing.label", definitionKey: "guided.glossary.stabilizing.definition" },
  reserve: { labelKey: "guided.glossary.reserve.label", definitionKey: "guided.glossary.reserve.definition" },
  skyguard: { labelKey: "guided.glossary.skyguard.label", definitionKey: "guided.glossary.skyguard.definition" },
  flying: { labelKey: "guided.glossary.flying.label", definitionKey: "guided.glossary.flying.definition" },
} as const satisfies Record<GuidedGlossaryTermId, GuidedGlossaryEntry>;

/**
 * Turns only explicitly authored glossary terms into rich segments. Each term is emphasized once
 * per paragraph so the teaching copy stays calm instead of becoming a field of underlines.
 */
export function guidedGlossarySegments(
  text: string,
  termIds: readonly GuidedGlossaryTermId[],
  translate: Translate,
): readonly GuidedGlossarySegment[] {
  const candidates = [...new Set(termIds)].map((termId) => {
    const entry = GUIDED_GLOSSARY[termId];
    const label = translate(entry.labelKey);
    return {
      termId,
      label,
      normalizedLabel: label.toLocaleLowerCase(),
      definition: translate(entry.definitionKey),
    };
  }).filter((candidate) => candidate.label.length > 0);
  const normalizedText = text.toLocaleLowerCase();
  const used = new Set<GuidedGlossaryTermId>();
  const segments: GuidedGlossarySegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let next: (typeof candidates)[number] & { index: number } | undefined;
    for (const candidate of candidates) {
      if (used.has(candidate.termId)) continue;
      const index = findWholeTerm(normalizedText, candidate.normalizedLabel, cursor);
      if (index < 0) continue;
      if (!next || index < next.index || (index === next.index && candidate.label.length > next.label.length)) {
        next = { ...candidate, index };
      }
    }
    if (!next) break;
    if (next.index > cursor) segments.push({ kind: "text", text: text.slice(cursor, next.index) });
    const end = next.index + next.label.length;
    segments.push({
      kind: "term",
      text: text.slice(next.index, end),
      termId: next.termId,
      definition: next.definition,
    });
    used.add(next.termId);
    cursor = end;
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments.length > 0 ? Object.freeze(segments) : Object.freeze([{ kind: "text", text }]);
}

function findWholeTerm(text: string, term: string, from: number): number {
  let index = text.indexOf(term, from);
  while (index >= 0) {
    const before = index > 0 ? text[index - 1] : undefined;
    const afterIndex = index + term.length;
    const after = afterIndex < text.length ? text[afterIndex] : undefined;
    if ((!before || !isWordCharacter(before)) && (!after || !isWordCharacter(after))) return index;
    index = text.indexOf(term, index + term.length);
  }
  return -1;
}

function isWordCharacter(character: string): boolean {
  return /[\p{L}\p{N}_]/u.test(character);
}
