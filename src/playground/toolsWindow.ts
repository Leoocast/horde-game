const TOOLS_WINDOW_NAME = "hostfall-playground-tools";
const TOOLS_WINDOW_BOUNDS_KEY = "hostfall.playground.toolsWindowBounds";

const DEFAULT_WIDTH = 780;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 620;

export type ToolsWindowBounds = {
  width: number;
  height: number;
  left?: number;
  top?: number;
};

export function openPlaygroundToolsWindow(existing?: Window | null): Window | null {
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }

  const bounds = readToolsWindowBounds();
  const features = [
    "popup=yes",
    "resizable=yes",
    "scrollbars=no",
    `width=${bounds.width}`,
    `height=${bounds.height}`,
    bounds.left === undefined ? undefined : `left=${bounds.left}`,
    bounds.top === undefined ? undefined : `top=${bounds.top}`,
  ].filter(Boolean).join(",");

  return window.open("", TOOLS_WINDOW_NAME, features);
}

export function trackToolsWindowBounds(popup: Window): () => void {
  let saveTimer: number | undefined;

  const save = () => {
    if (popup.closed) return;
    const bounds = normalizeToolsWindowBounds({
      width: popup.outerWidth,
      height: popup.outerHeight,
      left: popup.screenX,
      top: popup.screenY,
    });
    try {
      window.localStorage.setItem(TOOLS_WINDOW_BOUNDS_KEY, JSON.stringify(bounds));
    } catch {
      // Persistence is optional in private/restricted browser contexts.
    }
  };

  const scheduleSave = () => {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 180);
  };

  popup.addEventListener("resize", scheduleSave);
  popup.addEventListener("blur", save);
  popup.addEventListener("pagehide", save);
  const positionPoll = window.setInterval(save, 1200);

  return () => {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    window.clearInterval(positionPoll);
    popup.removeEventListener("resize", scheduleSave);
    popup.removeEventListener("blur", save);
    popup.removeEventListener("pagehide", save);
    save();
  };
}

export function normalizeToolsWindowBounds(candidate: Partial<ToolsWindowBounds>): ToolsWindowBounds {
  const availableWidth = Math.max(MIN_WIDTH, window.screen.availWidth || DEFAULT_WIDTH);
  const availableHeight = Math.max(MIN_HEIGHT, window.screen.availHeight || DEFAULT_HEIGHT);
  const width = clamp(finiteOr(candidate.width, DEFAULT_WIDTH), MIN_WIDTH, availableWidth);
  const height = clamp(finiteOr(candidate.height, DEFAULT_HEIGHT), MIN_HEIGHT, availableHeight);
  const defaultLeft = Math.max(0, availableWidth - width - 24);
  const left = clamp(finiteOr(candidate.left, defaultLeft), -availableWidth * 2, availableWidth * 2);
  const top = clamp(finiteOr(candidate.top, 24), -availableHeight, availableHeight * 2);
  return { width, height, left, top };
}

function readToolsWindowBounds(): ToolsWindowBounds {
  try {
    const stored = window.localStorage.getItem(TOOLS_WINDOW_BOUNDS_KEY);
    return normalizeToolsWindowBounds(stored ? JSON.parse(stored) as Partial<ToolsWindowBounds> : {});
  } catch {
    return normalizeToolsWindowBounds({});
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
