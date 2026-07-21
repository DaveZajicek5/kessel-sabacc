import { describe, expect, it } from 'vitest';
import { compareResolvedHands, rankResolvedHands, resolveHand } from '../scoring';
import type { Card, Hand } from '../types';

function card(family: 'blood' | 'sand', rank: Card['rank'], suffix = '0'): Card {
  return { id: `${family}-${rank}-${suffix}`, family, rank };
}

function hand(blood: Card['rank'], sand: Card['rank']): Hand {
  return { blood: card('blood', blood), sand: card('sand', sand) };
}

describe('Kessel Sabacc scoring', () => {
  it('treats two Sylops as unbeatable Pure Sabacc', () => {
    const pure = resolveHand(hand('sylop', 'sylop'));
    const oneSabacc = resolveHand(hand(1, 1));
    expect(pure.isPureSabacc).toBe(true);
    expect(compareResolvedHands(pure, oneSabacc)).toBeLessThan(0);
  });

  it('ranks lower-valued Sabacc above higher-valued Sabacc', () => {
    expect(compareResolvedHands(resolveHand(hand(2, 2)), resolveHand(hand(5, 5)))).toBeLessThan(0);
  });

  it('uses lower cards to break equal non-Sabacc differences', () => {
    const oneThree = resolveHand(hand(1, 3));
    const fourSix = resolveHand(hand(4, 6));
    expect(oneThree.difference).toBe(2);
    expect(fourSix.difference).toBe(2);
    expect(compareResolvedHands(oneThree, fourSix)).toBeLessThan(0);
  });

  it('allows multiple tied round winners', () => {
    const ranked = rankResolvedHands([
      { playerId: 'a', hand: resolveHand(hand(2, 2)), choices: {} },
      { playerId: 'b', hand: resolveHand(hand(2, 2)), choices: {} },
      { playerId: 'c', hand: resolveHand(hand(1, 2)), choices: {} },
    ]);
    expect(ranked.filter((entry) => entry.winner).map((entry) => entry.playerId)).toEqual(['a', 'b']);
  });
});
