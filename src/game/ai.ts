import { createFamilyDeck } from './deck';
import { beginDraw, finishDraw, getCurrentPlayer, getTopDiscard, stand, takeDiscard } from './engine';
import { nextRandom, randomInt } from './random';
import { handStrength } from './scoring';
import type {
  AiDecision,
  AiDifficulty,
  AiPersonality,
  Card,
  CardFamily,
  GameState,
  Hand,
  Player,
} from './types';

interface PersonalityProfile {
  tokenCost: number;
  exploration: number;
  noise: number;
  impostorBias: number;
  randomMoveChance: number;
}

const profiles: Record<AiPersonality, PersonalityProfile> = {
  cautious: { tokenCost: 7.5, exploration: 0.5, noise: 1.2, impostorBias: -2.5, randomMoveChance: 0.02 },
  balanced: { tokenCost: 4.8, exploration: 1.6, noise: 2.0, impostorBias: 0, randomMoveChance: 0.05 },
  gambler: { tokenCost: 2.4, exploration: 3.4, noise: 3.2, impostorBias: 2.5, randomMoveChance: 0.08 },
  analyst: { tokenCost: 4.0, exploration: 1.0, noise: 0.6, impostorBias: -0.4, randomMoveChance: 0 },
  chaos: { tokenCost: 0, exploration: 0, noise: 0, impostorBias: 0, randomMoveChance: 1 },
};

const difficultyModifiers: Record<AiDifficulty, { noise: number; randomChance: number }> = {
  casual: { noise: 2.2, randomChance: 0.18 },
  standard: { noise: 1, randomChance: 0.04 },
  expert: { noise: 0.35, randomChance: 0 },
};

function replaceFamily(hand: Hand, family: CardFamily, card: Card): Hand {
  return { ...hand, [family]: card };
}

function publicBeliefCards(state: GameState, family: CardFamily, player: Player): Card[] {
  const visibleIds = new Set<string>([
    player.hand[family].id,
    ...state.piles[`${family}Discard` as const].map((card) => card.id),
  ]);
  return createFamilyDeck(family).filter((card) => !visibleIds.has(card.id));
}

function cardPreference(card: Card, profile: PersonalityProfile): number {
  if (card.rank === 'impostor') return profile.impostorBias;
  if (card.rank === 'sylop') return 8;
  return 0;
}

function knownImprovement(player: Player, family: CardFamily, card: Card, profile: PersonalityProfile): number {
  const current = handStrength(player.hand);
  const replacement = handStrength(replaceFamily(player.hand, family, card));
  return replacement - current + cardPreference(card, profile);
}

function expectedDrawImprovement(
  state: GameState,
  player: Player,
  family: CardFamily,
  profile: PersonalityProfile,
): number {
  const current = handStrength(player.hand);
  const candidates = publicBeliefCards(state, family, player);
  if (candidates.length === 0) return -Infinity;
  const total = candidates.reduce((sum, card) => {
    const replacement = handStrength(replaceFamily(player.hand, family, card)) + cardPreference(card, profile);
    return sum + Math.max(current, replacement) - current;
  }, 0);
  return total / candidates.length;
}

function randomLegalDecision(state: GameState): { decision: AiDecision; randomState: number } {
  const player = getCurrentPlayer(state);
  if (player.stock <= 0) {
    return { decision: { kind: 'stand', explanation: 'No tokens remain.' }, randomState: state.randomState };
  }
  const options: AiDecision[] = [
    { kind: 'stand', explanation: 'A deliberately unpredictable stand.' },
  ];
  if (state.piles.bloodDraw.length > 0) options.push({ kind: 'draw', family: 'blood', source: 'draw', explanation: 'A chaotic draw.' });
  if (state.piles.sandDraw.length > 0) options.push({ kind: 'draw', family: 'sand', source: 'draw', explanation: 'A chaotic draw.' });
  if (state.piles.bloodDiscard.length > 0) options.push({ kind: 'draw', family: 'blood', source: 'discard', explanation: 'A chaotic grab.' });
  if (state.piles.sandDiscard.length > 0) options.push({ kind: 'draw', family: 'sand', source: 'discard', explanation: 'A chaotic grab.' });
  const roll = randomInt(state.randomState, 0, options.length - 1);
  return { decision: options[roll.value], randomState: roll.state };
}

export function chooseAiDecision(state: GameState): { decision: AiDecision; randomState: number } {
  const player = getCurrentPlayer(state);
  const profile = profiles[player.personality];
  const difficulty = difficultyModifiers[state.config.difficulty];
  if (player.stock <= 0) {
    return { decision: { kind: 'stand', explanation: 'No tokens remain.' }, randomState: state.randomState };
  }

  const randomCheck = nextRandom(state.randomState);
  if (player.personality === 'chaos' || randomCheck.value < profile.randomMoveChance + difficulty.randomChance) {
    return randomLegalDecision({ ...state, randomState: randomCheck.state });
  }

  const stockPressure = 1 + Math.max(0, 3 - player.stock) * 0.35;
  const turnPressure = 0.75 + state.turn * 0.25;
  const cost = profile.tokenCost * stockPressure * turnPressure;
  let randomState = randomCheck.state;
  const candidates: Array<{ decision: AiDecision; score: number }> = [];

  for (const family of ['blood', 'sand'] as const) {
    const discard = getTopDiscard(state, family);
    if (discard) {
      const known = knownImprovement(player, family, discard, profile);
      const knownNoise = nextRandom(randomState);
      randomState = knownNoise.state;
      candidates.push({
        decision: {
          kind: 'draw',
          family,
          source: 'discard',
          explanation: known > 12 ? 'The visible card creates a major improvement.' : 'The visible card is worth the token risk.',
        },
        score: known + profile.exploration - cost + (knownNoise.value - 0.5) * profile.noise * difficulty.noise,
      });
    }

    if (state.piles[`${family}Draw`].length > 0) {
      const expected = expectedDrawImprovement(state, player, family, profile);
      const drawNoise = nextRandom(randomState);
      randomState = drawNoise.state;
      candidates.push({
        decision: {
          kind: 'draw',
          family,
          source: 'draw',
          explanation: 'The unknown-card odds justify a draw.',
        },
        score: expected + profile.exploration - cost + (drawNoise.value - 0.5) * profile.noise * difficulty.noise,
      });
    }
  }

  const currentStrength = handStrength(player.hand);
  const standBonus = currentStrength >= 90 ? 22 : currentStrength >= 68 ? 7 : 0;
  candidates.push({
    decision: {
      kind: 'stand',
      explanation: currentStrength >= 90 ? 'The hand is already Sabacc-quality.' : 'The expected gain is not worth another token.',
    },
    score: standBonus,
  });

  candidates.sort((a, b) => b.score - a.score);
  return { decision: candidates[0].decision, randomState };
}

export function chooseAiKeep(state: GameState): { keep: boolean; randomState: number } {
  const pending = state.pendingDraw;
  const player = pending
    ? state.players.find((candidate) => candidate.id === pending.playerId)
    : undefined;
  if (!pending || !player) return { keep: false, randomState: state.randomState };

  if (player.personality === 'chaos') {
    const roll = nextRandom(state.randomState);
    return { keep: roll.value >= 0.5, randomState: roll.state };
  }

  const profile = profiles[player.personality];
  const difficulty = difficultyModifiers[state.config.difficulty];
  const improvement = knownImprovement(player, pending.family, pending.card, profile);
  const noiseRoll = nextRandom(state.randomState);
  const noise = (noiseRoll.value - 0.5) * profile.noise * difficulty.noise;
  return { keep: improvement + noise > -0.5, randomState: noiseRoll.state };
}

export function executeAiTurn(state: GameState): GameState {
  if (state.phase !== 'player-action') return state;
  const player = getCurrentPlayer(state);
  if (player.isHuman) return state;

  const choice = chooseAiDecision(state);
  let next = { ...state, randomState: choice.randomState };
  if (choice.decision.kind === 'stand') {
    return stand({
      ...next,
      log: [...next.log, `${player.name} decides: ${choice.decision.explanation}`].slice(-60),
    });
  }

  if (choice.decision.source === 'discard') {
    return takeDiscard(next, choice.decision.family!);
  }

  next = beginDraw(next, choice.decision.family!, 'draw');
  const keepChoice = chooseAiKeep(next);
  next = { ...next, randomState: keepChoice.randomState };
  return finishDraw(next, keepChoice.keep);
}
