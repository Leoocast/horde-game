export type BuffSurgeRenderMode = "webgl" | "css";

const MAX_CONCURRENT_WEBGL_BUFF_TARGETS = 4;

/**
 * Each local surge owns one WebGL context. Large token buffs therefore use the compositor-only
 * fallback on every target, avoiding the browser context limit and keeping the beat visible.
 */
export function buffSurgeRenderMode(targetCount: number): BuffSurgeRenderMode {
  return targetCount > MAX_CONCURRENT_WEBGL_BUFF_TARGETS ? "css" : "webgl";
}
