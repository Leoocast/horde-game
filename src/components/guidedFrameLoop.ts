export type GuidedFrameScheduler = Readonly<{
  request(callback: FrameRequestCallback): number;
  cancel(frame: number): void;
}>;

export type GuidedFrameLoop = Readonly<{
  start(): void;
  measureNow(): void;
  stop(): void;
}>;

const browserFrameScheduler: GuidedFrameScheduler = Object.freeze({
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (frame) => window.cancelAnimationFrame(frame),
});

/**
 * Owns one continuous measurement chain. External observers may request an immediate sample,
 * but only the loop itself is allowed to schedule the next animation frame.
 */
export function createGuidedFrameLoop(
  measure: () => void,
  scheduler: GuidedFrameScheduler = browserFrameScheduler,
): GuidedFrameLoop {
  let active = false;
  let frame: number | undefined;
  let epoch = 0;

  const schedule = () => {
    if (!active || frame !== undefined) return;
    const scheduledEpoch = epoch;
    frame = scheduler.request(() => tick(scheduledEpoch));
  };

  function tick(scheduledEpoch: number): void {
    if (!active || scheduledEpoch !== epoch) return;
    frame = undefined;
    measure();
    schedule();
  }

  return Object.freeze({
    start() {
      if (active) return;
      active = true;
      epoch += 1;
      measure();
      schedule();
    },
    measureNow() {
      if (active) measure();
    },
    stop() {
      active = false;
      epoch += 1;
      if (frame !== undefined) scheduler.cancel(frame);
      frame = undefined;
    },
  });
}
