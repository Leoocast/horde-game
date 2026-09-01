import type { GuidedCardAlias } from "./contracts";

/** Resolves authored draw deferrals without coupling the Hand to a particular lesson or card. */
export function guidedDeferredHandCardIds(
  aliases: readonly GuidedCardAlias[] | undefined,
  bindings: Readonly<Record<GuidedCardAlias, string>>,
): ReadonlySet<string> {
  return new Set((aliases ?? []).flatMap((alias) => bindings[alias] ? [bindings[alias]] : []));
}
