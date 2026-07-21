import { describe, expect, it } from 'vitest';
import { playAiGame } from '../simulator';

describe('headless simulator', () => {
  it('finishes seeded games without deadlocking', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = playAiGame({ opponentCount: 3, startingTokens: 5, difficulty: 'standard', seed });
      expect(result.finalState.phase).toBe('game-over');
      expect(result.rounds).toBeGreaterThan(0);
    }
  });
});
