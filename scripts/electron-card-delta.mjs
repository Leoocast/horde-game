import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { stagingRoot, verifyStaging } from "./electron-release-assets.mjs";

const manifest = verifyStaging();
const card = manifest.files.find((file) => file.path.startsWith("cards/") && file.path.endsWith(".png"));
if (!card) throw new Error("No staged card PNG is available for the delta probe.");

const original = fs.readFileSync(path.join(stagingRoot, ...card.path.split("/")));
const simulated = Buffer.concat([original, Buffer.from([0])]);
const simulatedHash = crypto.createHash("sha256").update(simulated).digest("hex");
const report = {
  schemaVersion: 1,
  probe: "single-card-resource-change",
  changedFiles: 1,
  unchangedAppAsar: true,
  file: card.path,
  before: { bytes: card.bytes, sha256: card.sha256 },
  after: { bytes: simulated.byteLength, sha256: simulatedHash },
};
const reportPath = path.join(path.dirname(stagingRoot), "card-delta-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
