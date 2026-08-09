import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  ProtocolPolicyError,
  isPathInsideRoot,
  mimeTypeForPath,
  parseByteRange,
  parseHostfallRequestUrl,
} from "./protocolPolicy";

export const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' hostfall: data:",
  "media-src 'self' hostfall:",
  "font-src 'self' hostfall:",
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const DEVELOPMENT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' hostfall: data:",
  "media-src 'self' hostfall:",
  "font-src 'self' hostfall:",
  "connect-src 'self' ws://localhost:*",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export type ProtocolFileIndex = Readonly<{
  app: ReadonlyMap<string, string>;
  content: ReadonlyMap<string, string>;
}>;

export async function createProtocolFileIndex(
  appRoot: string,
  contentRoots: readonly Readonly<{ logicalPrefix: "cards" | "fonts"; rootPath: string }>[],
): Promise<ProtocolFileIndex> {
  const appFiles = new Map<string, string>();
  const contentFiles = new Map<string, string>();
  await indexDirectory(appRoot, "", appFiles);
  for (const root of contentRoots) {
    await indexDirectory(root.rootPath, root.logicalPrefix, contentFiles);
  }
  if (!appFiles.has("index.html")) throw new Error("Electron renderer index.html is absent from the app bundle.");
  return Object.freeze({ app: appFiles, content: contentFiles });
}

export async function serveHostfallRequest(request: Request, index: ProtocolFileIndex): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return responseWithSecurityHeaders("Method not allowed", 405, { Allow: "GET, HEAD" });
  }

  try {
    const route = parseHostfallRequestUrl(request.url);
    const filePath = index[route.scope].get(route.logicalPath);
    if (!filePath) return responseWithSecurityHeaders("Not found", 404);

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return responseWithSecurityHeaders("Not found", 404);

    let range;
    try {
      range = parseByteRange(request.headers.get("range"), fileStat.size);
    } catch (error) {
      if (error instanceof ProtocolPolicyError && error.status === 416) {
        return responseWithSecurityHeaders("Range not satisfiable", 416, {
          "Content-Range": `bytes */${fileStat.size}`,
        });
      }
      throw error;
    }

    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": String(range?.length ?? fileStat.size),
      "Content-Type": mimeTypeForPath(filePath),
      "X-Content-Type-Options": "nosniff",
    };
    if (route.scope === "app") headers["Content-Security-Policy"] = PRODUCTION_CSP;
    if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileStat.size}`;

    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
    const nodeStream = createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined);
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    const status = error instanceof ProtocolPolicyError ? error.status : 500;
    return responseWithSecurityHeaders(status === 500 ? "Internal protocol error" : "Rejected", status);
  }
}

async function indexDirectory(rootPath: string, logicalPrefix: string, target: Map<string, string>): Promise<void> {
  const rootInfo = await lstat(rootPath);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`Protocol root is not a regular directory: ${rootPath}`);
  }
  const canonicalRoot = await realpath(rootPath);
  await visit(canonicalRoot, "");

  async function visit(directoryPath: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const absolutePath = path.join(directoryPath, entry.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are forbidden in protocol roots: ${absolutePath}`);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const canonicalFile = await realpath(absolutePath);
      if (!isPathInsideRoot(canonicalRoot, canonicalFile)) {
        throw new Error(`Indexed asset escaped its protocol root: ${absolutePath}`);
      }
      const logicalPath = logicalPrefix ? `${logicalPrefix}/${relativePath.replaceAll("\\", "/")}` : relativePath.replaceAll("\\", "/");
      if (target.has(logicalPath)) throw new Error(`Duplicate protocol asset identity: ${logicalPath}`);
      target.set(logicalPath, canonicalFile);
    }
  }
}

function responseWithSecurityHeaders(
  body: string,
  status: number,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": PRODUCTION_CSP,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
