import { describe, expect, it } from 'vitest';
import { beginDraw, createGame, finishDraw, getTopDiscard, stand } from '../engine';

describe('game engine', () => {
  it('builds 22-card family decks into valid opening piles', () => {
    const state = createGame({ opponentCount: 3, startingTokens: 5, difficulty: 'standard', seed: 7 });
    const bloodCount = state.piles.bloodDraw.length + state.piles.bloodDiscard.length + state.players.length;
    const sandCount = state.piles.sandDraw.length + state.piles.sandDiscard.length + state.players.length;
    expect(bloodCount).toBe(22);
    expect(sandCount).toBe(22);
  });

  it('charges one token for a draw and moves the replaced card to discard', () => {
    const initial = createGame({ opponentCount: 1, startingTokens: 5, difficulty: 'standard', seed: 1 });
    const current = initial.players.find((player) => player.id === initial.currentPlayerId)!;
    const oldCard = current.hand.blood;
    const drawing = beginDraw(initial, 'blood', 'draw');
    const after = finishDraw(drawing, true);
    const updated = after.players.find((player) => player.id === current.id)!;
    expect(updated.stock).toBe(4);
    expect(updated.pot).toBe(1);
    expect(after.piles.bloodDiscard.some((card) => card.id === oldCard.id)).toBe(true);
  });

  it('ends the round early when every player stands in one turn', () => {
    let state = createGame({ opponentCount: 1, startingTokens: 5, difficulty: 'standard', seed: 2 });
    state = stand(state);
    state = stand(state);
    expect(state.phase).toBe('resolution-choice');
    expect(state.turn).toBe(1);
  });

  it('allows taking a singleton discard with the last token without crashing', () => {
    const created = createGame({ opponentCount: 1, startingTokens: 1, difficulty: 'standard', seed: 3 });
    const initial = { ...created, startingSeat: 0, currentPlayerId: 'human' };
    expect(initial.piles.bloodDiscard).toHaveLength(1);

    const drawing = beginDraw(initial, 'blood', 'discard');
    const humanDuringDraw = drawing.players.find((player) => player.id === 'human')!;
    expect(drawing.phase).toBe('draw-decision');
    expect(humanDuringDraw.stock).toBe(0);
    expect(getTopDiscard(drawing, 'blood')).toEqual(drawing.pendingDraw?.card);

    const after = finishDraw(drawing, true);
    expect(after.piles.bloodDiscard).toHaveLength(1);
    expect(getTopDiscard(after, 'blood')).toBeDefined();
  });
});
