/** Host-only buy-phase timer. Never touches the sim engine. */

export type BuyTimerState = {
  remainingMs: number;
  /** When true, remainingMs stays frozen. Default for the UI is on. */
  hold: boolean;
};

/** Apply wall-clock elapsed to a buy timer. Hold freezes remaining time. */
export function tickBuyTimer(state: BuyTimerState, elapsedMs: number): BuyTimerState {
  if (state.hold || elapsedMs <= 0 || state.remainingMs <= 0) {
    return state;
  }
  return {
    ...state,
    remainingMs: Math.max(0, state.remainingMs - Math.floor(elapsedMs)),
  };
}

export function formatBuyTimer(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
