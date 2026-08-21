import { createDesktopHistoryPersistenceAdapter } from "./desktopHistoryAdapter";
import { HistoryService, type HistoryServiceOptions } from "./historyService";
import { createBrowserHistoryPersistenceAdapter } from "./webHistoryAdapter";

/** Creates the platform service without initializing it or connecting it to match lifecycle/UI. */
export function createHistoryServiceForCurrentPlatform(
  options: HistoryServiceOptions = {},
): HistoryService {
  if (typeof window === "undefined") throw new Error("History persistence requires a renderer window.");
  const adapter = window.hostfallDesktop
    ? createDesktopHistoryPersistenceAdapter()
    : createBrowserHistoryPersistenceAdapter();
  return new HistoryService(adapter, options);
}
