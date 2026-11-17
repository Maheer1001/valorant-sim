export type Rng = {
  nextUint32(): number;
  /** Uniform integer in [0, bound). */
  nextInt(bound: number): number;
  /** Current mulberry32 state for persisting named streams across windows. */
  getState(): number;
};

function createRng(initialState: number): Rng {
  let state = initialState >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextUint32,
    nextInt(bound: number): number {
      if (!Number.isInteger(bound) || bound <= 0 || bound > 0x100000000) {
        throw new Error("RNG bound must be an integer from 1 through 2^32.");
      }
      const limit = 0x100000000 - (0x100000000 % bound);
      let draw = nextUint32();
      while (draw >= limit) {
        draw = nextUint32();
      }
      return draw % bound;
    },
    getState(): number {
      return state >>> 0;
    },
  };
}

/** Stable substream seed. Adding a new label does not change other labels. */
export function forkSeed(rootSeed: number, label: string): number {
  let hash = 2166136261;
  const text = `${rootSeed >>> 0}:${label}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createStream(rootSeed: number, label: string): Rng {
  return createRng(forkSeed(rootSeed, label));
}

/** Resume a named stream from a previously saved mulberry32 state. */
export function resumeStream(state: number): Rng {
  return createRng(state >>> 0);
}
