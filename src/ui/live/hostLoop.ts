/**
 * Pure host clock for the live UI. Wall-clock time only decides how many
 * sim steps to run; it never feeds the engine. Pause is speed === 0.
 */

export type HostSpeed = 0 | 0.5 | 1 | 2 | 4;

export type HostLoopInput = {
  /** Elapsed wall-clock milliseconds since the previous frame. */
  elapsedMs: number;
  speed: HostSpeed;
  /** Fractional sim-step debt carried between frames. */
  accumulator: number;
  simStepMs: number;
  /** Hard cap so a tab thaw cannot spiral. Excess time is dropped. */
  maxStepsPerFrame?: number;
};

export type HostLoopOutput = {
  steps: number;
  accumulator: number;
  /**
   * Interpolation fraction in [0, 1) toward the next committed step boundary.
   * Render at simTime + alpha * simStepMs for standing routes.
   */
  alpha: number;
};

/**
 * Convert wall-clock elapsed time into a whole number of sim steps.
 * `accumulator` holds leftover fractional steps so pacing stays smooth.
 */
export function hostLoopStep(input: HostLoopInput): HostLoopOutput {
  const maxSteps = input.maxStepsPerFrame ?? 10;
  if (input.speed === 0 || input.elapsedMs <= 0 || input.simStepMs <= 0) {
    return { steps: 0, accumulator: input.accumulator, alpha: frac(input.accumulator) };
  }
  const debt = input.accumulator + (input.elapsedMs * input.speed) / input.simStepMs;
  let steps = Math.floor(debt);
  let accumulator = debt - steps;
  if (steps > maxSteps) {
    steps = maxSteps;
    // Drop excess time instead of spiralling after a long stall.
    accumulator = 0;
  }
  return { steps, accumulator, alpha: frac(accumulator) };
}

function frac(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const f = value - Math.floor(value);
  return f < 1 ? f : 0;
}

export function formatRoundTimer(remainingMs: number): string {
  const clamped = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function cycleSpeedUp(speed: HostSpeed): HostSpeed {
  if (speed === 0 || speed === 0.5) return 1;
  if (speed === 1) return 2;
  if (speed === 2) return 4;
  return 4;
}

export function cycleSpeedDown(speed: HostSpeed): HostSpeed {
  if (speed === 4) return 2;
  if (speed === 2) return 1;
  if (speed === 1) return 0.5;
  return 0.5;
}
