export type LogicalAssetRef = Readonly<{
  packKey: string;
  path: string;
}>;

export interface AssetResolver {
  resolve(ref: LogicalAssetRef): string;
}

export function builtinAssetRef(packKey: string, authoredUrl: string): LogicalAssetRef {
  if (!authoredUrl.startsWith("/cards/")) {
    throw new Error(`Builtin asset "${authoredUrl}" is outside the logical /cards root.`);
  }
  return Object.freeze({ packKey, path: validateLogicalAssetPath(authoredUrl.slice(1)) });
}

export function builtinAudioAssetRef(packKey: string, authoredUrl: string): LogicalAssetRef {
  if (!authoredUrl.startsWith("/audio/")) {
    throw new Error(`Builtin audio asset "${authoredUrl}" is outside the logical /audio root.`);
  }
  return Object.freeze({ packKey, path: validateLogicalAssetPath(authoredUrl.slice(1)) });
}

export function createWebAssetResolver(allowedPackKeys: readonly string[]): AssetResolver {
  const allowed = new Set(allowedPackKeys);
  return Object.freeze({
    resolve(ref: LogicalAssetRef): string {
      validateAssetRef(ref, allowed);
      return `/${ref.path}`;
    },
  });
}

export function createDesktopAssetResolver(allowedPackKeys: readonly string[]): AssetResolver {
  const allowed = new Set(allowedPackKeys);
  return Object.freeze({
    resolve(ref: LogicalAssetRef): string {
      validateAssetRef(ref, allowed);
      const encodedPath = ref.path.split("/").map(encodeURIComponent).join("/");
      return `hostfall://content/${encodeURIComponent(ref.packKey)}/${encodedPath}`;
    },
  });
}

export function validateLogicalAssetPath(path: string): string {
  if (!path || path.length > 512) throw new Error("Logical asset path is empty or too long.");
  if (path.includes("\0") || path.includes("\\") || path.includes("?") || path.includes("#") || path.includes("%")) {
    throw new Error(`Logical asset path "${path}" contains forbidden characters.`);
  }
  if (path.startsWith("/") || path.startsWith("//") || /^[a-zA-Z]:/u.test(path) || /^[a-z][a-z0-9+.-]*:/iu.test(path)) {
    throw new Error(`Logical asset path "${path}" cannot be absolute or contain a scheme.`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Logical asset path "${path}" contains an invalid segment.`);
  }
  return path;
}

function validateAssetRef(ref: LogicalAssetRef, allowedPackKeys: ReadonlySet<string>): void {
  if (!allowedPackKeys.has(ref.packKey)) throw new Error(`Asset pack "${ref.packKey}" is not registered.`);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(ref.packKey)) {
    throw new Error(`Asset pack key "${ref.packKey}" is invalid.`);
  }
  validateLogicalAssetPath(ref.path);
}
