import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyGenerationManifest } from "./card-generation-manifest.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blockers = [];

const generation = verifyGenerationManifest();
if (!generation.ok) {
  blockers.push({
    id: "card-fingerprints",
    message: `${generation.issues.length} Card Studio freshness issue(s) affect ${generation.unverifiedPngs.length} PNG(s).`,
  });
}

const audioAssets = JSON.parse(fs.readFileSync(path.join(root, "src", "audio", "runtimeAudioAssets.json"), "utf8"));
const reviewAudio = collectStrings(audioAssets).filter((asset) => asset.includes("_NEED_REVIEW"));
if (reviewAudio.length) blockers.push({ id: "audio-review", message: `${reviewAudio.length} runtime audio asset(s) remain marked NEED_REVIEW.` });

const noticePath = path.join(root, "THIRD_PARTY_NOTICES.txt");
if (!fs.existsSync(noticePath) || fs.readFileSync(noticePath, "utf8").includes("LICENSE TEXT NOT SHIPPED")) {
  blockers.push({ id: "third-party-license", message: "At least one bundled dependency still needs its authoritative license text reviewed." });
}

if (!fs.existsSync(path.join(root, "build", "icon.ico"))) {
  blockers.push({ id: "windows-icon", message: "The final multi-resolution Windows icon build/icon.ico is missing." });
}

const signingRecordPath = path.join(root, "docs", "electron", "windows_signing.json");
const signingRecord = fs.existsSync(signingRecordPath)
  ? JSON.parse(fs.readFileSync(signingRecordPath, "utf8"))
  : undefined;
if (signingRecord?.status !== "owner-approved" || typeof signingRecord?.certificateSubject !== "string") {
  blockers.push({ id: "windows-signing", message: "Windows signing identity/certificate has not been configured or owner-verified." });
}

const report = { status: blockers.length ? "blocked" : "ready", blockers };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Hostfall Electron release audit");
  for (const blocker of blockers) console.log(`BLOCK ${blocker.id}: ${blocker.message}`);
  if (!blockers.length) console.log("Release audit: OK");
}
if (blockers.length) process.exitCode = 1;

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, output));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, output));
  return output;
}
