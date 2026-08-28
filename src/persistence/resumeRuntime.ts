import type { ProductCapabilities } from "../product/productCapabilities";
import { PRODUCT_CAPABILITIES } from "../product/productCapabilities";
import {
  deleteDesktopResume,
  loadDesktopResume,
  startDesktopResumeCheckpointing,
  type DesktopResumeLoad,
} from "./resumeService";

export type ResumeCheckpointOptions = Readonly<{
  setupTurns: number;
  playerName: string;
}>;

export type ResumeRuntimeOperations = Readonly<{
  load: () => Promise<DesktopResumeLoad>;
  clear: () => Promise<void>;
  startCheckpointing: (options: ResumeCheckpointOptions) => () => void;
}>;

export type ResumeRuntime = Readonly<{
  enabled: boolean;
  load: () => Promise<DesktopResumeLoad>;
  clear: () => Promise<void>;
  startCheckpointing: (options: ResumeCheckpointOptions) => () => void;
}>;

const DESKTOP_RESUME_OPERATIONS: ResumeRuntimeOperations = Object.freeze({
  load: loadDesktopResume,
  clear: deleteDesktopResume,
  startCheckpointing: startDesktopResumeCheckpointing,
});

const NO_RESUME: DesktopResumeLoad = Object.freeze({ status: "none" });
const NOOP_DISPOSE = () => undefined;

export function createResumeRuntime(
  capabilities: ProductCapabilities,
  operations: ResumeRuntimeOperations = DESKTOP_RESUME_OPERATIONS,
): ResumeRuntime {
  if (!capabilities.resumeGame) {
    return Object.freeze({
      enabled: false,
      load: () => Promise.resolve(NO_RESUME),
      clear: () => Promise.resolve(),
      startCheckpointing: () => NOOP_DISPOSE,
    });
  }

  return Object.freeze({
    enabled: true,
    load: operations.load,
    clear: operations.clear,
    startCheckpointing: operations.startCheckpointing,
  });
}

export const productResumeRuntime = createResumeRuntime(PRODUCT_CAPABILITIES);
