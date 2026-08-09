/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  protocol,
  screen as electronScreen,
  session,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { RotatingFileLogger } from "./logger";
import {
  DesktopJsonStore,
  desktopDataPaths,
  parseWindowState,
  type DesktopDataPaths,
  type PersistedWindowState,
} from "./persistence";
import { HOSTFALL_APP_ORIGIN, HOSTFALL_SCHEME } from "./protocolPolicy";
import {
  createProtocolFileIndex,
  DEVELOPMENT_CSP,
  serveHostfallRequest,
} from "./protocolServer";

const CREDIT_URL = "https://github.com/Leoocast";
const APP_ID = "com.hostfall.game";
const EXTERNAL_LINKS = Object.freeze({ credits: CREDIT_URL });
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeMode = process.env.HOSTFALL_ELECTRON_SMOKE === "1";
let mainWindow: BrowserWindow | null = null;
let logger: RotatingFileLogger | null = null;
let dataPaths: DesktopDataPaths | null = null;
const desktopStore = new DesktopJsonStore();
let windowStateSaveTimer: NodeJS.Timeout | undefined;
let lastLifecycleState: "background" | "foreground" | "suspend" | "resume" | undefined;
let quitAfterFlush = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: HOSTFALL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      codeCache: true,
      bypassCSP: false,
      supportFetchAPI: false,
      allowServiceWorkers: false,
    },
  },
]);

if (process.env.HOSTFALL_ELECTRON_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.HOSTFALL_ELECTRON_USER_DATA));
}
app.setName("Hostfall");
app.enableSandbox();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

process.on("uncaughtException", (error) => logger?.log("error", "Uncaught main-process exception", error));
process.on("unhandledRejection", (reason) => logger?.log("error", "Unhandled main-process rejection", reason));

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("web-contents-created", (_event, webContents) => hardenWebContents(webContents));
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitAfterFlush) return;
  event.preventDefault();
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = undefined;
  }
  void persistWindowState()
    .then(() => desktopStore.flush())
    .then(() => logger?.flush())
    .finally(() => {
      quitAfterFlush = true;
      app.quit();
    });
});

if (hasSingleInstanceLock) {
  void app.whenReady().then(startApplication).catch(async (error: unknown) => {
    logger?.log("error", "Electron bootstrap failed", error);
    await logger?.flush();
    app.exit(1);
  });
}

async function startApplication(): Promise<void> {
  app.setAppUserModelId(APP_ID);
  logger = new RotatingFileLogger(path.join(app.getPath("userData"), "logs"));
  await logger.initialize();
  logger.log("info", "Starting Hostfall desktop", {
    version: app.getVersion(),
    electron: process.versions.electron,
    packaged: usesPackagedLayout(),
  });

  Menu.setApplicationMenu(null);
  dataPaths = desktopDataPaths(app.getPath("userData"));
  configureSessionSecurity();
  registerIpcHandlers();
  configurePowerLifecycle();

  const packagedLayout = usesPackagedLayout();
  const rendererRoot = packagedLayout
    ? path.join(app.getAppPath(), ".vite", "renderer", MAIN_WINDOW_VITE_NAME)
    : undefined;
  const contentBase = packagedLayout ? path.dirname(app.getAppPath()) : app.getAppPath();
  const fileIndex = await createProtocolFileIndex(rendererRoot, [
    { logicalPrefix: "audio", rootPath: path.join(contentBase, packagedLayout ? "audio" : "assets") },
    { logicalPrefix: "cards", rootPath: path.join(contentBase, packagedLayout ? "cards" : "public/cards") },
    { logicalPrefix: "fonts", rootPath: path.join(contentBase, packagedLayout ? "fonts" : "public/fonts") },
  ]);
  protocol.handle(HOSTFALL_SCHEME, (request) => serveHostfallRequest(request, fileIndex));

  const storedWindowState = await loadWindowState();
  mainWindow = createMainWindow(storedWindowState);
  await loadRenderer(mainWindow);
  if (process.env.HOSTFALL_ELECTRON_BOOT_PROBE === "1") await runPackagedBootProbe(mainWindow);
}

async function runPackagedBootProbe(window: BrowserWindow): Promise<void> {
  const renderer = await window.webContents.executeJavaScript(`({
    url: location.href,
    rootMounted: Boolean(document.querySelector('#root')?.firstElementChild),
    requireType: typeof globalThis.require,
    processType: typeof globalThis.process,
    bridgeKeys: Object.keys(window.hostfallDesktop ?? {}).sort()
  })`);
  const report = {
    executablePath: process.execPath,
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    renderer,
  };
  await writeFile(path.join(app.getPath("userData"), "smoke-boot.json"), JSON.stringify(report, null, 2), "utf8");
  logger?.log("info", "Packaged boot probe completed", report);
  await logger?.flush();
  app.quit();
}

function createMainWindow(storedState?: PersistedWindowState): BrowserWindow {
  const bounds = visibleWindowBounds(storedState);
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#080c0d",
    autoHideMenuBar: true,
    fullscreen: storedState?.fullscreen ?? false,
    title: "Hostfall",
    webPreferences: {
      preload: path.join(moduleDirectory, "preload.cjs"),
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      devTools: !usesPackagedLayout(),
      backgroundThrottling: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => {
    if (storedState?.maximized && !storedState.fullscreen) window.maximize();
    if (!smokeMode) window.show();
  });
  const onWindowGeometryChanged = () => {
    scheduleWindowStateSave();
    emitWindowState(window);
  };
  window.on("move", onWindowGeometryChanged);
  window.on("resize", onWindowGeometryChanged);
  window.on("maximize", onWindowGeometryChanged);
  window.on("unmaximize", onWindowGeometryChanged);
  window.on("enter-full-screen", onWindowGeometryChanged);
  window.on("leave-full-screen", onWindowGeometryChanged);
  window.on("minimize", () => {
    emitWindowState(window);
    emitLifecycle("background");
  });
  window.on("restore", () => {
    emitWindowState(window);
    emitLifecycle(window.isFocused() ? "foreground" : "background");
  });
  window.on("blur", () => {
    emitWindowState(window);
    emitLifecycle("background");
  });
  window.on("focus", () => {
    emitWindowState(window);
    if (!window.isMinimized()) emitLifecycle("foreground");
  });
  window.on("close", () => {
    if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = undefined;
    void persistWindowState(window);
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string" && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }
  await window.loadURL(`${HOSTFALL_APP_ORIGIN}/`);
}

function hardenWebContents(webContents: WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("console-message", (details) => {
    if (details.level !== "error") return;
    logger?.log("error", `Renderer console: ${details.message}`, {
      lineNumber: details.lineNumber,
      sourceId: details.sourceId,
    });
  });
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.on("will-redirect", (event) => event.preventDefault());
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    logger?.log("error", "Renderer load failed", { errorCode, errorDescription, validatedUrl });
  });
  webContents.on("render-process-gone", (_event, details) => {
    logger?.log("error", "Renderer process exited", details);
  });
  webContents.on("unresponsive", () => logger?.log("warn", "Renderer became unresponsive"));
  webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key.toLowerCase() === "f11") {
      event.preventDefault();
      const owner = BrowserWindow.fromWebContents(webContents);
      if (owner) owner.setFullScreen(!owner.isFullScreen());
      return;
    }
    if (!usesPackagedLayout()) return;
    const key = input.key.toLowerCase();
    if (key === "f12" || key === "f5" || ((input.control || input.meta) && (key === "r" || (input.shift && key === "i")))) {
      event.preventDefault();
    }
  });
}

function configureSessionSecurity(): void {
  const desktopSession = session.defaultSession;
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  desktopSession.on("will-download", (event) => event.preventDefault());

  desktopSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      if (isAllowedDevelopmentNetworkUrl(details.url)) callback({ cancel: false });
      else callback({ cancel: true });
    },
  );

  if (!usesPackagedLayout()) {
    desktopSession.webRequest.onHeadersReceived(
      { urls: ["http://localhost:*/*"] },
      (details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [DEVELOPMENT_CSP],
          },
        });
      },
    );
  }
}

function isAllowedDevelopmentNetworkUrl(candidate: string): boolean {
  if (usesPackagedLayout() || typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "string") return false;
  try {
    const expected = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const actual = new URL(candidate);
    const expectedWebSocketProtocol = expected.protocol === "https:" ? "wss:" : "ws:";
    return actual.host === expected.host && (actual.protocol === expected.protocol || actual.protocol === expectedWebSocketProtocol);
  } catch {
    return false;
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("hostfall:get-bootstrap", (event) => {
    assertTrustedRenderer(event);
    return Object.freeze({ version: app.getVersion(), platform: process.platform });
  });

  ipcMain.handle("hostfall:get-window-state", (event) => {
    assertTrustedRenderer(event);
    return currentWindowState(BrowserWindow.fromWebContents(event.sender) ?? mainWindow);
  });

  ipcMain.handle("hostfall:set-fullscreen", (event, enabled: unknown) => {
    assertTrustedRenderer(event);
    if (typeof enabled !== "boolean") throw new Error("Fullscreen state must be boolean.");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("Fullscreen request has no owning window.");
    window.setFullScreen(enabled);
    emitWindowState(window);
    scheduleWindowStateSave();
    return currentWindowState(window);
  });

  ipcMain.handle("hostfall:read-preferences", async (event) => {
    assertTrustedRenderer(event);
    return desktopStore.readCandidates(requireDataPaths().preferences);
  });

  ipcMain.handle("hostfall:write-preferences", async (event, value: unknown) => {
    assertTrustedRenderer(event);
    assertEnvelope(value, "hostfall-preferences");
    await desktopStore.write(requireDataPaths().preferences, value);
  });

  ipcMain.handle("hostfall:read-resume-save", async (event) => {
    assertTrustedRenderer(event);
    return desktopStore.readCandidates(requireDataPaths().resumeSave);
  });

  ipcMain.handle("hostfall:write-resume-save", async (event, value: unknown) => {
    assertTrustedRenderer(event);
    assertEnvelope(value, "hostfall-resume");
    await desktopStore.write(requireDataPaths().resumeSave, value);
  });

  ipcMain.handle("hostfall:delete-resume-save", async (event) => {
    assertTrustedRenderer(event);
    await desktopStore.delete(requireDataPaths().resumeSave);
  });

  ipcMain.handle("hostfall:open-external", async (event, linkId: unknown) => {
    assertTrustedRenderer(event);
    if (typeof linkId !== "string" || !Object.hasOwn(EXTERNAL_LINKS, linkId)) throw new Error("Unknown external link identity.");
    const target = EXTERNAL_LINKS[linkId as keyof typeof EXTERNAL_LINKS];
    await shell.openExternal(target, { activate: true });
    return true;
  });

  ipcMain.handle("hostfall:report-error", (event, payload: unknown) => {
    assertTrustedRenderer(event);
    const report = parseRendererError(payload);
    logger?.log("error", `Renderer ${report.source} error: ${report.message}`, report.stack);
  });
}

function requireDataPaths(): DesktopDataPaths {
  if (!dataPaths) throw new Error("Desktop persistence is not initialized.");
  return dataPaths;
}

async function loadWindowState(): Promise<PersistedWindowState | undefined> {
  const candidates = await desktopStore.readCandidates(requireDataPaths().windowState);
  return parseWindowState(candidates.primary) ?? parseWindowState(candidates.backup);
}

function visibleWindowBounds(state?: PersistedWindowState): { width: number; height: number; x?: number; y?: number } {
  const fallback = { width: state?.width ?? 1280, height: state?.height ?? 720 };
  if (state?.x === undefined || state.y === undefined) return fallback;
  const candidate = { x: state.x, y: state.y, width: fallback.width, height: fallback.height };
  const display = electronScreen.getDisplayMatching(candidate);
  const area = display.workArea;
  const visibleWidth = Math.max(0, Math.min(candidate.x + candidate.width, area.x + area.width) - Math.max(candidate.x, area.x));
  const visibleHeight = Math.max(0, Math.min(candidate.y + candidate.height, area.y + area.height) - Math.max(candidate.y, area.y));
  return visibleWidth >= 120 && visibleHeight >= 80 ? candidate : fallback;
}

function scheduleWindowStateSave(delayMs = 250): void {
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = undefined;
    void persistWindowState();
  }, delayMs);
}

async function persistWindowState(window = mainWindow): Promise<void> {
  if (!window || window.isDestroyed() || !dataPaths) return;
  const bounds = window.getNormalBounds();
  await desktopStore.write(dataPaths.windowState, {
    formatVersion: 1,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
  });
}

function currentWindowState(window: BrowserWindow | null): Readonly<{
  fullscreen: boolean;
  maximized: boolean;
  minimized: boolean;
  focused: boolean;
}> {
  return Object.freeze({
    fullscreen: Boolean(window?.isFullScreen()),
    maximized: Boolean(window?.isMaximized()),
    minimized: Boolean(window?.isMinimized()),
    focused: Boolean(window?.isFocused()),
  });
}

function emitWindowState(window: BrowserWindow): void {
  if (!window.isDestroyed()) window.webContents.send("hostfall:window-state", currentWindowState(window));
}

function configurePowerLifecycle(): void {
  powerMonitor.on("suspend", () => emitLifecycle("suspend"));
  powerMonitor.on("resume", () => emitLifecycle("resume"));
}

function emitLifecycle(state: "background" | "foreground" | "suspend" | "resume"): void {
  if ((state === "background" || state === "foreground") && lastLifecycleState === state) return;
  lastLifecycleState = state;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("hostfall:lifecycle", state);
}

function assertEnvelope(value: unknown, kind: "hostfall-preferences" | "hostfall-resume"): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Desktop persistence envelope is malformed.");
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== kind || candidate.formatVersion !== 1) throw new Error("Desktop persistence envelope is unsupported.");
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? "";
  if (senderUrl.startsWith(`${HOSTFALL_APP_ORIGIN}/`)) return;
  if (!usesPackagedLayout() && typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string") {
    try {
      if (new URL(senderUrl).origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin) return;
    } catch {
      // Rejected below.
    }
  }
  throw new Error("IPC sender is outside the trusted renderer origin.");
}

function usesPackagedLayout(): boolean {
  return app.isPackaged || app.getAppPath().toLowerCase().endsWith(".asar");
}

function parseRendererError(payload: unknown): Readonly<{ message: string; stack?: string; source: "boundary" | "window" | "promise" }> {
  if (!payload || typeof payload !== "object") throw new Error("Renderer error report is malformed.");
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.message !== "string" || candidate.message.length < 1 || candidate.message.length > 4096) {
    throw new Error("Renderer error message is malformed.");
  }
  if (candidate.stack !== undefined && (typeof candidate.stack !== "string" || candidate.stack.length > 16_384)) {
    throw new Error("Renderer error stack is malformed.");
  }
  if (candidate.source !== "boundary" && candidate.source !== "window" && candidate.source !== "promise") {
    throw new Error("Renderer error source is malformed.");
  }
  return Object.freeze({
    message: candidate.message,
    stack: candidate.stack as string | undefined,
    source: candidate.source,
  });
}
