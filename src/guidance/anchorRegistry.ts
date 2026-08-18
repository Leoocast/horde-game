import type {
  GuidedCardAlias,
  GuidedHighlightRef,
  GuidedHighlightRole,
  GuidedSurfaceAnchor,
} from "./contracts";

export type GuidedAnchorKey = `card:${string}` | `surface:${GuidedSurfaceAnchor}`;

export type GuidedResolvedAnchor = Readonly<{
  key: GuidedAnchorKey;
  highlight: GuidedHighlightRef;
  role: GuidedHighlightRole;
  element?: HTMLElement;
}>;

export type GuidedAnchorRegistrySnapshot = Readonly<{
  revision: number;
  keys: readonly GuidedAnchorKey[];
}>;

/**
 * Semantic bridge between authored lesson references and live DOM nodes. Components register their
 * own nodes; the overlay never searches for CSS selectors or knows how a deck renders a card.
 * Multiple owners are retained because a card can briefly exist in two presentation layers while
 * it travels between zones.
 */
export class GuidedAnchorRegistry {
  #entries = new Map<GuidedAnchorKey, Map<string, HTMLElement>>();
  #listeners = new Set<() => void>();
  #revision = 0;
  #snapshot: GuidedAnchorRegistrySnapshot = Object.freeze({ revision: 0, keys: Object.freeze([]) });

  set(key: GuidedAnchorKey, owner: string, element: HTMLElement | null): void {
    const owners = this.#entries.get(key);
    const previous = owners?.get(owner);
    if (previous === element || (!previous && !element)) return;

    if (!element) {
      owners?.delete(owner);
      if (owners?.size === 0) this.#entries.delete(key);
    } else {
      const nextOwners = owners ?? new Map<string, HTMLElement>();
      nextOwners.set(owner, element);
      this.#entries.set(key, nextOwners);
    }
    this.#emit();
  }

  preferred(key: GuidedAnchorKey): HTMLElement | undefined {
    const candidates = [...(this.#entries.get(key)?.values() ?? [])].reverse();
    return candidates.find(isUsableAnchorElement) ?? candidates[0];
  }

  keysContaining(target: EventTarget | null): readonly GuidedAnchorKey[] {
    if (!isNode(target)) return Object.freeze([]);
    const matches: GuidedAnchorKey[] = [];
    for (const [key, owners] of this.#entries) {
      if ([...owners.values()].some((element) => element === target || element.contains(target))) matches.push(key);
    }
    return Object.freeze(matches);
  }

  snapshot(): GuidedAnchorRegistrySnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  reset(): void {
    if (this.#entries.size === 0) return;
    this.#entries.clear();
    this.#emit();
  }

  #emit(): void {
    this.#revision += 1;
    this.#snapshot = Object.freeze({
      revision: this.#revision,
      keys: Object.freeze([...this.#entries.keys()].sort()),
    });
    for (const listener of this.#listeners) listener();
  }
}

export const guidedAnchorRegistry = new GuidedAnchorRegistry();

export function guidedCardAnchorKey(instanceId: string): GuidedAnchorKey {
  return `card:${instanceId}`;
}

export function guidedSurfaceAnchorKey(anchor: GuidedSurfaceAnchor): GuidedAnchorKey {
  return `surface:${anchor}`;
}

export function resolveGuidedAnchors(
  highlights: readonly GuidedHighlightRef[],
  bindings: Readonly<Record<GuidedCardAlias, string>>,
  registry: GuidedAnchorRegistry = guidedAnchorRegistry,
): readonly GuidedResolvedAnchor[] {
  const seen = new Set<string>();
  const resolved: GuidedResolvedAnchor[] = [];
  for (const highlight of highlights) {
    const instanceId = highlight.kind === "card" ? bindings[highlight.alias] : undefined;
    const key = highlight.kind === "card"
      ? instanceId ? guidedCardAnchorKey(instanceId) : undefined
      : guidedSurfaceAnchorKey(highlight.anchor);
    if (!key) continue;
    const identity = `${key}:${highlight.role ?? "focus"}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    resolved.push(Object.freeze({
      key,
      highlight,
      role: highlight.role ?? "focus",
      element: registry.preferred(key),
    }));
  }
  return Object.freeze(resolved);
}

function isUsableAnchorElement(element: HTMLElement): boolean {
  if (element.isConnected === false) return false;
  if (typeof element.getBoundingClientRect !== "function") return true;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isNode(target: EventTarget | null): target is Node {
  return typeof Node !== "undefined" && target instanceof Node;
}
