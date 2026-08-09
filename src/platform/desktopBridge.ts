export type ExternalLinkId = "credits";
export type RendererErrorSource = "boundary" | "window" | "promise";

export type RendererErrorReport = Readonly<{
  message: string;
  stack?: string;
  source: RendererErrorSource;
}>;

export type HostfallDesktopBridge = Readonly<{
  getBootstrap(): Promise<Readonly<{ version: string; platform: string }>>;
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
