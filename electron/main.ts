/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { RotatingFileLogger } from "./logger";
import { HOSTFALL_APP_ORIGIN, HOSTFALL_SCHEME } from "./protocolPolicy";
import {
  createProtocolFileIndex,
  DEVELOPMENT_CSP,
  serveHostfallRequest,
} from "./protocolServer";

const CREDIT_URL = "https://github.com/Leoocast";
const EXTERNAL_LINKS = Object.freeze({ credits: CREDIT_URL });
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeMode = process.env.HOSTFALL_ELECTRON_SMOKE === "1";
let mainWindow: BrowserWindow | null = null;
let logger: RotatingFileLogger | null = null;

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
app.on("before-quit", () => void logger?.flush());

if (hasSingleInstanceLock) {
  void app.whenReady().then(startApplication).catch(async (error: unknown) => {
    logger?.log("error", "Electron bootstrap failed", error);
    await logger?.flush();
    app.exit(1);
  });
}

async function startApplication(): Promise<void> {
  logger = new RotatingFileLogger(path.join(app.getPath("userData"), "logs"));
  await logger.initialize();
  logger.log("info", "Starting Hostfall desktop", {
    version: app.getVersion(),
    electron: process.versions.electron,
    packaged: usesPackagedLayout(),
  });

  Menu.setApplicationMenu(null);
  configureSessionSecurity();
  registerIpcHandlers();

  const rendererRoot = path.join(app.getAppPath(), ".vite", "renderer", MAIN_WINDOW_VITE_NAME);
  const contentBase = usesPackagedLayout() ? path.dirname(app.getAppPath()) : path.join(app.getAppPath(), "public");
  const fileIndex = await createProtocolFileIndex(rendererRoot, [
    { logicalPrefix: "cards", rootPath: path.join(contentBase, "cards") },
    { logicalPrefix: "fonts", rootPath: path.join(contentBase, "fonts") },
  ]);
  protocol.handle(HOSTFALL_SCHEME, (request) => serveHostfallRequest(request, fileIndex));

  mainWindow = createMainWindow();
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

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#080c0d",
    autoHideMenuBar: true,
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
    if (!smokeMode) window.show();
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
