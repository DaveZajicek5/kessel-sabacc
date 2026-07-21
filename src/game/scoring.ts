import type {
  Hand,
  ImpostorChoices,
  ImpostorRolls,
  ResolvedHand,
  RoundResult,
} from './types';

function numericRank(rank: Hand['blood']['rank'], fallback: number): number {
  if (typeof rank === 'number') return rank;
  if (rank === 'impostor') return fallback;
  return Number.NaN;
}

export function resolveHand(hand: Hand, choices: ImpostorChoices = {}): ResolvedHand {
  if (hand.blood.rank === 'sylop' && hand.sand.rank === 'sylop') {
    return {
      blood: 0,
      sand: 0,
      difference: 0,
      sum: 0,
      isSabacc: true,
      isPureSabacc: true,
    };
  }

  let blood = numericRank(hand.blood.rank, choices.blood ?? 1);
  let sand = numericRank(hand.sand.rank, choices.sand ?? 1);

  if (hand.blood.rank === 'sylop') blood = sand;
  if (hand.sand.rank === 'sylop') sand = blood;

  const difference = Math.abs(blood - sand);
  return {
    blood,
    sand,
    difference,
    sum: blood + sand,
    isSabacc: difference === 0,
    isPureSabacc: false,
  };
}

export function compareResolvedHands(a: ResolvedHand, b: ResolvedHand): number {
  if (a.isPureSabacc !== b.isPureSabacc) return a.isPureSabacc ? -1 : 1;
  if (a.isSabacc !== b.isSabacc) return a.isSabacc ? -1 : 1;
  if (a.isSabacc && b.isSabacc) {
    if (a.blood !== b.blood) return a.blood - b.blood;
    return 0;
  }
  if (a.difference !== b.difference) return a.difference - b.difference;
  if (a.sum !== b.sum) return a.sum - b.sum;
  return 0;
}

export function chooseBestImpostorValues(hand: Hand, rolls: ImpostorRolls): ImpostorChoices {
  const bloodOptions = rolls.blood ?? [undefined];
  const sandOptions = rolls.sand ?? [undefined];
  let bestChoices: ImpostorChoices = {};
  let bestHand: ResolvedHand | undefined;

  for (const blood of bloodOptions) {
    for (const sand of sandOptions) {
      const choices: ImpostorChoices = {};
      if (typeof blood === 'number') choices.blood = blood;
      if (typeof sand === 'number') choices.sand = sand;
      const resolved = resolveHand(hand, choices);
      if (!bestHand || compareResolvedHands(resolved, bestHand) < 0) {
        bestHand = resolved;
        bestChoices = choices;
      }
    }
  }
  return bestChoices;
}

export function rankResolvedHands(
  entries: Array<{ playerId: string; hand: ResolvedHand; choices: ImpostorChoices }>,
): Array<Pick<RoundResult, 'playerId' | 'hand' | 'rank' | 'winner' | 'impostorChoices'>> {
  const sorted = [...entries].sort((a, b) => compareResolvedHands(a.hand, b.hand));
  let rank = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && compareResolvedHands(entry.hand, sorted[index - 1].hand) !== 0) {
      rank = index + 1;
    }
    return {
      playerId: entry.playerId,
      hand: entry.hand,
      rank,
      winner: rank === 1,
      impostorChoices: entry.choices,
    };
  });
}

export function handStrength(hand: Hand): number {
  if (hand.blood.rank === 'sylop' && hand.sand.rank === 'sylop') return 120;

  const bloodOptions = hand.blood.rank === 'impostor' ? [1, 2, 3, 4, 5, 6] : [undefined];
  const sandOptions = hand.sand.rank === 'impostor' ? [1, 2, 3, 4, 5, 6] : [undefined];
  let best = -Infinity;

  for (const blood of bloodOptions) {
    for (const sand of sandOptions) {
      const resolved = resolveHand(hand, {
        ...(typeof blood === 'number' ? { blood } : {}),
        ...(typeof sand === 'number' ? { sand } : {}),
      });
      const score = resolved.isPureSabacc
        ? 120
        : resolved.isSabacc
          ? 100 - resolved.blood * 3
          : 60 - resolved.difference * 9 - resolved.sum * 0.35;
      best = Math.max(best, score);
    }
  }

  return best;
}
