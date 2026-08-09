import path from "node:path";

export const HOSTFALL_SCHEME = "hostfall";
export const HOSTFALL_APP_ORIGIN = "hostfall://app";
export const BUILTIN_CONTENT_PACK_KEY = "builtin.hostfall.core";

export type ProtocolRoute = Readonly<{
  scope: "app" | "content";
  logicalPath: string;
}>;

export type ByteRange = Readonly<{
  start: number;
  end: number;
  length: number;
}>;

export class ProtocolPolicyError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProtocolPolicyError";
    this.status = status;
  }
}

export function parseHostfallRequestUrl(
  requestUrl: string,
  allowedPackKeys: ReadonlySet<string> = new Set([BUILTIN_CONTENT_PACK_KEY]),
): ProtocolRoute {
  if (!requestUrl.startsWith(`${HOSTFALL_SCHEME}://`)) {
    throw new ProtocolPolicyError("Only the hostfall scheme is accepted.", 403);
  }
  if (requestUrl.includes("?") || requestUrl.includes("#")) {
    throw new ProtocolPolicyError("Query strings and fragments are not valid asset identities.");
  }

  const remainder = requestUrl.slice(`${HOSTFALL_SCHEME}://`.length);
  const slashIndex = remainder.indexOf("/");
  const rawHost = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  const rawPath = slashIndex === -1 ? "/" : remainder.slice(slashIndex);

  if (!rawHost || rawHost.includes("%") || rawHost.includes("@") || rawHost.includes(":")) {
    throw new ProtocolPolicyError("The protocol host is malformed.", 403);
  }
  const decodedPath = decodeAndValidatePath(rawPath);

  if (rawHost === "app") {
    if (decodedPath === "/") return Object.freeze({ scope: "app", logicalPath: "index.html" });
    const logicalPath = decodedPath.slice(1);
    if (logicalPath.startsWith("fonts/")) {
      return Object.freeze({ scope: "content", logicalPath });
    }
    return Object.freeze({ scope: "app", logicalPath });
  }

  if (rawHost === "content") {
    const segments = decodedPath.slice(1).split("/");
    const packKey = segments.shift() ?? "";
    if (!allowedPackKeys.has(packKey)) {
      throw new ProtocolPolicyError(`Content pack "${packKey}" is not registered.`, 403);
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(packKey)) {
      throw new ProtocolPolicyError("The content pack key is malformed.");
    }
    const logicalPath = segments.join("/");
    if (!logicalPath.startsWith("cards/") && !logicalPath.startsWith("fonts/")) {
      throw new ProtocolPolicyError("The requested content root is not exposed.", 403);
    }
    return Object.freeze({ scope: "content", logicalPath });
  }

  throw new ProtocolPolicyError(`Protocol host "${rawHost}" is not registered.`, 403);
}

export function parseByteRange(header: string | null, size: number): ByteRange | null {
  if (header === null) return null;
  if (!Number.isSafeInteger(size) || size < 0) throw new ProtocolPolicyError("Invalid asset size.", 500);
  if (size === 0) throw new ProtocolPolicyError("Ranges are unavailable for an empty asset.", 416);

  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new ProtocolPolicyError("Only one valid byte range is accepted.", 416);
  }

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new ProtocolPolicyError("The suffix range is invalid.", 416);
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      throw new ProtocolPolicyError("The byte range is outside the asset.", 416);
    }
    end = Math.min(end, size - 1);
  }

  return Object.freeze({ start, end, length: end - start + 1 });
}

export function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decodeAndValidatePath(rawPath: string): string {
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    throw new ProtocolPolicyError("The protocol path must be rooted exactly once.");
  }
  if (/%(?:00|2e|2f|5c|25)/iu.test(rawPath)) {
    throw new ProtocolPolicyError("The protocol path contains an encoded control or separator.");
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new ProtocolPolicyError("The protocol path is not valid UTF-8.");
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\") || decodedPath.startsWith("//")) {
    throw new ProtocolPolicyError("The protocol path contains a forbidden control or separator.");
  }
  if (decodedPath.length > 1024) throw new ProtocolPolicyError("The protocol path is too long.");

  const segments = decodedPath.slice(1).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    if (decodedPath !== "/") throw new ProtocolPolicyError("The protocol path contains an invalid segment.");
  }
  if (
    segments.some(
      (segment) => /^[a-zA-Z]:/u.test(segment) || /^[a-z][a-z0-9+.-]*:/iu.test(segment),
    )
  ) {
    throw new ProtocolPolicyError("Absolute paths and embedded schemes are forbidden.");
  }
  return decodedPath;
}

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});
