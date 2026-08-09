import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPackage } from "@electron/asar";
import { _electron as electron } from "playwright-core";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagedExecutablePath = path.join(
  projectRoot,
  "out",
  "Electron Packages",
  "Hostfall-win32-x64",
  "Hostfall.exe",
);
const packagedAppPath = path.join(path.dirname(packagedExecutablePath), "resources", "app.asar");
const harnessExecutablePath = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe");
assert.match(packagedAppPath, /\s/u, "The packaged smoke path must contain a space.");
const packagedMp3Path = listPackage(packagedAppPath, { isPack: false })
  .map((entry) => entry.replaceAll("\\", "/"))
  .find((entry) => entry.startsWith("/.vite/renderer/main_window/assets/") && entry.endsWith(".mp3"));
assert.ok(packagedMp3Path, "The packaged ASAR must contain at least one MP3.");
const packagedAudioUrl = `hostfall://app/${packagedMp3Path.split("/.vite/renderer/main_window/")[1]}`;

const userDataPath = await mkdtemp(path.join(os.tmpdir(), "Hostfall smoke user data "));
const bootProbeUserDataPath = await mkdtemp(path.join(os.tmpdir(), "Hostfall release boot probe "));
const rendererErrors = [];
const remoteRequests = [];
let application;
let passed = false;

try {
  application = await electron.launch({
    executablePath: harnessExecutablePath,
    args: [packagedAppPath],
    env: {
      ...process.env,
      HOSTFALL_ELECTRON_SMOKE: "1",
      HOSTFALL_ELECTRON_USER_DATA: userDataPath,
    },
    timeout: 45_000,
  });

  application.on("window", (window) => {
    window.on("pageerror", (error) => rendererErrors.push(error.message));
    window.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    window.on("request", (request) => {
      if (/^https?:/iu.test(request.url())) remoteRequests.push(request.url());
    });
  });

  const window = await application.firstWindow({ timeout: 45_000 });
  await window.waitForLoadState("domcontentloaded");
  await window.waitForFunction(() => Boolean(document.querySelector("#root")?.firstElementChild), undefined, { timeout: 45_000 });

  assert.equal(window.url(), "hostfall://app/");
  assert.equal(await window.title(), "Hostfall");

  const processState = await application.evaluate(({ app }) => ({
    defaultAppHarness: !app.isPackaged,
    appPath: app.getAppPath(),
    version: app.getVersion(),
  }));
  assert.equal(path.resolve(processState.appPath).toLowerCase(), path.resolve(packagedAppPath).toLowerCase());

  const rendererBoundary = await window.evaluate(async () => ({
    requireType: typeof globalThis.require,
    processType: typeof globalThis.process,
    bridgeKeys: Object.keys(window.hostfallDesktop ?? {}).sort(),
    bootstrap: await window.hostfallDesktop?.getBootstrap(),
    blockedWindow: window.open("https://example.com", "_blank") === null,
  }));
  assert.equal(rendererBoundary.requireType, "undefined");
  assert.equal(rendererBoundary.processType, "undefined");
  assert.deepEqual(rendererBoundary.bridgeKeys, ["getBootstrap", "openExternalLink", "reportError"]);
  assert.equal(rendererBoundary.bootstrap?.platform, "win32");
  assert.equal(rendererBoundary.blockedWindow, true);

  const mediaState = await window.evaluate(async ({ audioUrl }) => {
    const loadImage = (url) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(`Image failed: ${url}`));
      image.src = url;
    });

    const fullCard = await loadImage(
      "hostfall://content/builtin.hostfall.core/cards/pact_of_elarion/aelyra_heir_of_elarion.png",
    );
    const fieldArt = await loadImage(
      "hostfall://content/builtin.hostfall.core/cards/pact_of_elarion/art/aelyra_heir_of_elarion.jpg",
    );
    await document.fonts.load('16px "Cinzel"');

    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audio.muted = true;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Audio metadata timed out.")), 20_000);
      audio.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(undefined); }, { once: true });
      audio.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Audio metadata failed.")); }, { once: true });
      audio.load();
    });
    const seekTarget = Number.isFinite(audio.duration) ? Math.min(1, audio.duration / 2) : 0;
    if (seekTarget > 0) {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Audio seek timed out.")), 10_000);
        audio.addEventListener("seeked", () => { window.clearTimeout(timeout); resolve(undefined); }, { once: true });
        audio.currentTime = seekTarget;
      });
    }

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("WebGL is unavailable.");
    const contextLossExtension = gl.getExtension("WEBGL_lose_context");
    let contextLossObserved = false;
    let contextReacquired = true;
    if (contextLossExtension) {
      contextLossObserved = await new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 5_000);
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          window.clearTimeout(timeout);
          resolve(true);
        }, { once: true });
        contextLossExtension.loseContext();
      });
      const replacementCanvas = document.createElement("canvas");
      contextReacquired = Boolean(replacementCanvas.getContext("webgl2") ?? replacementCanvas.getContext("webgl"));
    }

    return {
      fullCard,
      fieldArt,
      fontReady: document.fonts.check('16px "Cinzel"'),
      audioDuration: audio.duration,
      seekTarget,
      webgl: true,
      contextLossExtension: Boolean(contextLossExtension),
      contextLossObserved,
      contextReacquired,
    };
  }, { audioUrl: packagedAudioUrl });

  assert.ok(mediaState.fullCard.width > 0 && mediaState.fullCard.height > 0);
  assert.ok(mediaState.fieldArt.width > 0 && mediaState.fieldArt.height > 0);
  assert.equal(mediaState.fontReady, true);
  assert.ok(mediaState.audioDuration > 0);
  assert.equal(mediaState.webgl, true);
  if (mediaState.contextLossExtension) {
    assert.equal(mediaState.contextLossObserved, true);
    assert.equal(mediaState.contextReacquired, true);
  }
  assert.deepEqual(remoteRequests, []);
  assert.deepEqual(rendererErrors, []);

  await application.close();
  application = undefined;

  const releaseProcess = spawn(packagedExecutablePath, [], {
    env: {
      ...process.env,
      HOSTFALL_ELECTRON_BOOT_PROBE: "1",
      HOSTFALL_ELECTRON_SMOKE: "1",
      HOSTFALL_ELECTRON_USER_DATA: bootProbeUserDataPath,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  const releaseExitCode = await waitForProcessExit(releaseProcess, 45_000);
  assert.equal(releaseExitCode, 0);
  const releaseBoot = JSON.parse(await readFile(path.join(bootProbeUserDataPath, "smoke-boot.json"), "utf8"));
  assert.equal(releaseBoot.packaged, true);
  assert.equal(path.resolve(releaseBoot.executablePath).toLowerCase(), path.resolve(packagedExecutablePath).toLowerCase());
  assert.equal(releaseBoot.renderer.url, "hostfall://app/");
  assert.equal(releaseBoot.renderer.rootMounted, true);
  assert.equal(releaseBoot.renderer.requireType, "undefined");
  assert.equal(releaseBoot.renderer.processType, "undefined");

  console.log(JSON.stringify({
    packagedExecutablePath,
    packagedAppPath,
    processState,
    rendererBoundary,
    mediaState,
    releaseBoot,
    offline: remoteRequests.length === 0,
  }, null, 2));
  passed = true;
} finally {
  if (application) await application.close().catch(() => undefined);
  if (passed) {
    await rm(userDataPath, { recursive: true, force: true });
    await rm(bootProbeUserDataPath, { recursive: true, force: true });
  } else {
    console.error(`Smoke diagnostics retained at: ${userDataPath}`);
    console.error(`Release boot diagnostics retained at: ${bootProbeUserDataPath}`);
  }
}

function waitForProcessExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Packaged executable did not exit after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}
