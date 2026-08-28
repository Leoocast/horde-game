export type ProductEdition = "demo" | "early-access-resume-regression";

export type ProductCapabilities = Readonly<{
  edition: ProductEdition;
  resumeGame: boolean;
  seedHistory: boolean;
}>;

export const DEMO_CAPABILITIES: ProductCapabilities = Object.freeze({
  edition: "demo",
  resumeGame: false,
  seedHistory: true,
});

/**
 * Preserva la vertical vigente de resume para que ocultarla en la demo no la deje sin cobertura.
 * Mantiene el historial apagado hasta enlazar un futuro checkpoint con su attemptId.
 */
export const EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES: ProductCapabilities = Object.freeze({
  edition: "early-access-resume-regression",
  resumeGame: true,
  seedHistory: false,
});

/** La build actual apunta a la demo hasta que exista una selección de producto explícita. */
export const PRODUCT_CAPABILITIES = DEMO_CAPABILITIES;
