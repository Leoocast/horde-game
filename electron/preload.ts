import { contextBridge, ipcRenderer } from "electron";

type ExternalLinkId = "credits";
type DesktopLifecycleState = "background" | "foreground" | "suspend" | "resume";
type DesktopWindowState = Readonly<{
  fullscreen: boolean;
  maximized: boolean;
  minimized: boolean;
  focused: boolean;
}>;

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const desktopBridge = Object.freeze({
  getBootstrap: () => ipcRenderer.invoke("hostfall:get-bootstrap") as Promise<Readonly<{ version: string; platform: string }>>,
  getWindowState: () => ipcRenderer.invoke("hostfall:get-window-state") as Promise<DesktopWindowState>,
  setFullscreen: (enabled: boolean) => ipcRenderer.invoke("hostfall:set-fullscreen", enabled) as Promise<DesktopWindowState>,
  onWindowStateChanged: (callback: (state: DesktopWindowState) => void) => subscribe("hostfall:window-state", callback),
  onLifecycleChanged: (callback: (state: DesktopLifecycleState) => void) => subscribe("hostfall:lifecycle", callback),
  readPreferences: () => ipcRenderer.invoke("hostfall:read-preferences"),
  writePreferences: (value: unknown) => ipcRenderer.invoke("hostfall:write-preferences", value) as Promise<void>,
  readResumeSave: () => ipcRenderer.invoke("hostfall:read-resume-save"),
  writeResumeSave: (value: unknown) => ipcRenderer.invoke("hostfall:write-resume-save", value) as Promise<void>,
  deleteResumeSave: () => ipcRenderer.invoke("hostfall:delete-resume-save") as Promise<void>,
  openExternalLink: (linkId: ExternalLinkId) => ipcRenderer.invoke("hostfall:open-external", linkId) as Promise<boolean>,
  reportError: (report: Readonly<{ message: string; stack?: string; source: "boundary" | "window" | "promise" }>) =>
    ipcRenderer.invoke("hostfall:report-error", report) as Promise<void>,
});

contextBridge.exposeInMainWorld("hostfallDesktop", desktopBridge);
