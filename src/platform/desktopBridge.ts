export type ExternalLinkId = "credits";
export type RendererErrorSource = "boundary" | "window" | "promise";
export type DesktopLifecycleState = "background" | "foreground" | "suspend" | "resume";

export type DesktopWindowState = Readonly<{
  fullscreen: boolean;
  maximized: boolean;
  minimized: boolean;
  focused: boolean;
}>;

export type StoredJsonCandidates = Readonly<{
  primary?: unknown;
  backup?: unknown;
  primaryCorrupted: boolean;
  backupCorrupted: boolean;
}>;

export type RendererErrorReport = Readonly<{
  message: string;
  stack?: string;
  source: RendererErrorSource;
}>;

export type HostfallDesktopBridge = Readonly<{
  getBootstrap(): Promise<Readonly<{ version: string; platform: string }>>;
  getWindowState(): Promise<DesktopWindowState>;
  setFullscreen(enabled: boolean): Promise<DesktopWindowState>;
  onWindowStateChanged(callback: (state: DesktopWindowState) => void): () => void;
  onLifecycleChanged(callback: (state: DesktopLifecycleState) => void): () => void;
  readPreferences(): Promise<StoredJsonCandidates>;
  writePreferences(value: unknown): Promise<void>;
  readResumeSave(): Promise<StoredJsonCandidates>;
  writeResumeSave(value: unknown): Promise<void>;
  deleteResumeSave(): Promise<void>;
  openExternalLink(linkId: ExternalLinkId): Promise<boolean>;
  reportError(report: RendererErrorReport): Promise<void>;
}>;

declare global {
  interface Window {
    hostfallDesktop?: HostfallDesktopBridge;
  }
}

const WEB_EXTERNAL_LINKS: Readonly<Record<ExternalLinkId, string>> = Object.freeze({
  credits: "https://github.com/Leoocast",
});

export function openExternalLink(linkId: ExternalLinkId): Promise<boolean> {
  if (window.hostfallDesktop) return window.hostfallDesktop.openExternalLink(linkId);
  const opened = window.open(WEB_EXTERNAL_LINKS[linkId], "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return Promise.resolve(Boolean(opened));
}

export function reportRendererError(report: RendererErrorReport): void {
  void window.hostfallDesktop?.reportError({
    message: report.message.slice(0, 4096),
    stack: report.stack?.slice(0, 16_384),
    source: report.source,
  }).catch(() => undefined);
}

export function desktopWindowState(): Promise<DesktopWindowState> {
  if (window.hostfallDesktop) return window.hostfallDesktop.getWindowState();
  return Promise.resolve(webWindowState());
}

export async function setDesktopFullscreen(enabled: boolean): Promise<DesktopWindowState> {
  if (window.hostfallDesktop) return window.hostfallDesktop.setFullscreen(enabled);
  if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
  if (!enabled && document.fullscreenElement) await document.exitFullscreen();
  return webWindowState();
}

export function onDesktopWindowStateChanged(callback: (state: DesktopWindowState) => void): () => void {
  if (window.hostfallDesktop) return window.hostfallDesktop.onWindowStateChanged(callback);
  const listener = () => callback(webWindowState());
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

function webWindowState(): DesktopWindowState {
  return Object.freeze({
    fullscreen: Boolean(document.fullscreenElement),
    maximized: false,
    minimized: document.visibilityState === "hidden",
    focused: document.hasFocus(),
  });
}
