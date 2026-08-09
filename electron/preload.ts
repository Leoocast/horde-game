import { contextBridge, ipcRenderer } from "electron";

type ExternalLinkId = "credits";

const desktopBridge = Object.freeze({
  getBootstrap: () => ipcRenderer.invoke("hostfall:get-bootstrap") as Promise<Readonly<{ version: string; platform: string }>>,
  openExternalLink: (linkId: ExternalLinkId) => ipcRenderer.invoke("hostfall:open-external", linkId) as Promise<boolean>,
  reportError: (report: Readonly<{ message: string; stack?: string; source: "boundary" | "window" | "promise" }>) =>
    ipcRenderer.invoke("hostfall:report-error", report) as Promise<void>,
});

contextBridge.exposeInMainWorld("hostfallDesktop", desktopBridge);
