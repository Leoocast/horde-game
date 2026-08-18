import type { ContextualConceptDefinition } from "./contextualContracts";

const CONCEPT_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

/** Runtime registry. Scopes let the development lab install fixtures without shipping content. */
export class ContextualConceptRegistry {
  #scopes = new Map<string, readonly ContextualConceptDefinition[]>();

  constructor(definitions: readonly ContextualConceptDefinition[] = []) {
    this.setScope("product", definitions);
  }

  get concepts(): readonly ContextualConceptDefinition[] {
    return Object.freeze([...this.#scopes.values()].flat());
  }

  setScope(scope: string, definitions: readonly ContextualConceptDefinition[]): void {
    if (!scope.trim()) throw new Error("Contextual concept scopes require a non-empty name.");
    const existingOutsideScope = new Set(
      [...this.#scopes.entries()]
        .filter(([name]) => name !== scope)
        .flatMap(([, concepts]) => concepts.map(({ id }) => id)),
    );
    const ownIds = new Set<string>();
    for (const definition of definitions) {
      validateContextualConcept(definition);
      if (ownIds.has(definition.id) || existingOutsideScope.has(definition.id)) {
        throw new Error(`Duplicate contextual concept id "${definition.id}".`);
      }
      ownIds.add(definition.id);
    }
    this.#scopes.set(scope, Object.freeze([...definitions]));
  }

  clearScope(scope: string): void {
    if (scope === "product") this.#scopes.set(scope, Object.freeze([]));
    else this.#scopes.delete(scope);
  }
}

export function validateContextualConcept(definition: ContextualConceptDefinition): void {
  if (!CONCEPT_ID_PATTERN.test(definition.id)) throw new Error(`Invalid contextual concept id "${definition.id}".`);
  if (!Number.isInteger(definition.revision) || definition.revision < 1) {
    throw new Error(`Contextual concept "${definition.id}" requires a positive revision.`);
  }
  if (!Number.isInteger(definition.priority) || definition.priority < 0 || definition.priority > 1000) {
    throw new Error(`Contextual concept "${definition.id}" requires an integer priority from 0 to 1000.`);
  }
  if (new Set(definition.signalKinds).size !== definition.signalKinds.length) {
    throw new Error(`Contextual concept "${definition.id}" contains duplicate signal kinds.`);
  }
  if (definition.policy === "preventive" && !definition.prevent) {
    throw new Error(`Preventive contextual concept "${definition.id}" requires an intent interceptor.`);
  }
  if (definition.policy !== "preventive" && definition.prevent) {
    throw new Error(`Only preventive contextual concepts may intercept an intent ("${definition.id}").`);
  }
}
