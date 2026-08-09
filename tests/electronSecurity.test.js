import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ProtocolPolicyError,
  isPathInsideRoot,
  mimeTypeForPath,
  parseByteRange,
  parseHostfallRequestUrl,
} from "../electron/protocolPolicy";
import { serveHostfallRequest } from "../electron/protocolServer";

test("hostfall protocol maps only registered app and content identities", () => {
  assert.deepEqual(parseHostfallRequestUrl("hostfall://app/"), { scope: "app", logicalPath: "index.html" });
  assert.deepEqual(parseHostfallRequestUrl("hostfall://app/assets/menu%20theme.mp3"), {
    scope: "app",
    logicalPath: "assets/menu theme.mp3",
  });
  assert.deepEqual(parseHostfallRequestUrl("hostfall://app/fonts/pact/lora.woff2"), {
    scope: "content",
    logicalPath: "fonts/pact/lora.woff2",
  });
  assert.deepEqual(
    parseHostfallRequestUrl("hostfall://content/builtin.hostfall.core/cards/pact/card.png"),
    { scope: "content", logicalPath: "cards/pact/card.png" },
  );
  assert.deepEqual(
    parseHostfallRequestUrl("hostfall://content/builtin.hostfall.core/audio/music/main%20menu.mp3"),
    { scope: "content", logicalPath: "audio/music/main menu.mp3" },
  );
});

test("hostfall protocol rejects traversal, encoded separators, drives, schemes and unknown authorities", () => {
  const rejected = [
    "file://app/index.html",
    "hostfall://unknown/index.html",
    "hostfall://app/../secret.txt",
    "hostfall://app/%2e%2e/secret.txt",
    "hostfall://app/assets%2fsecret.txt",
    "hostfall://app/assets%5csecret.txt",
    "hostfall://app/C:/Windows/win.ini",
    "hostfall://app/file:secret.txt",
    "hostfall://app/assets/main.js?remote=true",
    "hostfall://content/unknown.pack/cards/card.png",
    "hostfall://content/builtin.hostfall.core/private/card.json",
  ];
  for (const candidate of rejected) {
    assert.throws(() => parseHostfallRequestUrl(candidate), ProtocolPolicyError, candidate);
  }
});

test("byte ranges support media seek and reject ambiguous or invalid requests", () => {
  assert.equal(parseByteRange(null, 10), null);
  assert.deepEqual(parseByteRange("bytes=2-5", 10), { start: 2, end: 5, length: 4 });
  assert.deepEqual(parseByteRange("bytes=7-", 10), { start: 7, end: 9, length: 3 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9, length: 3 });
  assert.throws(() => parseByteRange("bytes=10-11", 10), ProtocolPolicyError);
  assert.throws(() => parseByteRange("bytes=0-1,3-4", 10), ProtocolPolicyError);
  assert.throws(() => parseByteRange("items=0-1", 10), ProtocolPolicyError);
});

test("protocol MIME and root containment policies are explicit", () => {
  assert.equal(mimeTypeForPath("card.PNG"), "image/png");
  assert.equal(mimeTypeForPath("song.mp3"), "audio/mpeg");
  assert.equal(mimeTypeForPath("font.woff2"), "font/woff2");
  assert.equal(mimeTypeForPath("unknown.bin"), "application/octet-stream");

  const root = path.resolve("C:/hostfall/content");
  assert.equal(isPathInsideRoot(root, path.join(root, "cards", "card.png")), true);
  assert.equal(isPathInsideRoot(root, path.resolve(root, "..", "secret.txt")), false);
});

test("protocol server returns partial bytes and security headers without exposing arbitrary paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hostfall protocol "));
  const filePath = path.join(directory, "sample.mp3");
  await writeFile(filePath, Buffer.from([0, 1, 2, 3, 4, 5]));
  try {
    const index = {
      app: new Map([["assets/sample.mp3", filePath]]),
      content: new Map(),
    };
    const response = await serveHostfallRequest(
      new Request("hostfall://app/assets/sample.mp3", { headers: { Range: "bytes=2-4" } }),
      index,
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 2-4/6");
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/u);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3, 4]);

    const rejected = await serveHostfallRequest(new Request("hostfall://app/not-indexed.txt"), index);
    assert.equal(rejected.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
