import {
  builtinAssetRef,
  builtinAudioAssetRef,
  createDesktopAssetResolver,
  createWebAssetResolver,
} from "./AssetResolver";
import { BuiltinContentSource, BUILTIN_PACK_DESCRIPTOR } from "./BuiltinContentSource";
import { ContentCatalog } from "./ContentCatalog";

const ACTIVE_SOURCES = Object.freeze([new BuiltinContentSource()]);

/** Built before App/Zustand modules consume decks; local and Workshop sources are intentionally absent. */
export const contentCatalog = new ContentCatalog(ACTIVE_SOURCES);

/** Selected at build time: tests/web retain root URLs; Electron uses the registered content scheme. */
export const assetResolver = (__HOSTFALL_DESKTOP__ ? createDesktopAssetResolver : createWebAssetResolver)(
  contentCatalog.packs.map(({ packKey }) => packKey),
);

export function resolveBuiltinAssetUrl(authoredUrl: string): string {
  return assetResolver.resolve(builtinAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, authoredUrl));
}

export function resolveBuiltinAudioUrl(authoredUrl: string): string {
  return assetResolver.resolve(builtinAudioAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, authoredUrl));
}

export function assertContentBootstrapReady(): void {
  if (contentCatalog.activeSources.length !== 1 || contentCatalog.activeSources[0]?.origin !== "builtin") {
    throw new Error("Unexpected content sources are active during the builtin-only migration phase.");
  }
}
