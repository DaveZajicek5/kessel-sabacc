export interface RandomResult<T> {
  value: T;
  state: number;
}

export function normalizeSeed(seed: number): number {
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextRandom(state: number): RandomResult<number> {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return {
    value: ((t ^ (t >>> 14)) >>> 0) / 4294967296,
    state: (state + 0x6d2b79f5) >>> 0,
  };
}

export function randomInt(state: number, min: number, max: number): RandomResult<number> {
  const next = nextRandom(state);
  return {
    value: Math.floor(next.value * (max - min + 1)) + min,
    state: next.state,
  };
}

export function shuffleWithState<T>(items: T[], initialState: number): RandomResult<T[]> {
  const copy = [...items];
  let state = initialState;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const roll = randomInt(state, 0, index);
    state = roll.state;
    [copy[index], copy[roll.value]] = [copy[roll.value], copy[index]];
  }
  return { value: copy, state };
}
