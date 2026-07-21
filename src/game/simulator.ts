import { executeAiTurn } from './ai';
import { createGame, finalizeResolution, startNextRound } from './engine';
import type { AiPersonality, GameConfig, GameState } from './types';

export interface SimulationResult {
  winnerPersonality: AiPersonality;
  rounds: number;
  finalState: GameState;
}

export function playAiGame(config: GameConfig): SimulationResult {
  let state = createGame(config);
  state = {
    ...state,
    players: state.players.map((player) =>
      player.isHuman ? { ...player, isHuman: false, personality: 'balanced' } : player,
    ),
  };

  let safety = 0;
  while (state.phase !== 'game-over') {
    safety += 1;
    if (safety > 2_000) throw new Error('Simulation exceeded safety limit');
    if (state.phase === 'player-action') state = executeAiTurn(state);
    else if (state.phase === 'resolution-choice') state = finalizeResolution(state);
    else if (state.phase === 'round-over') state = startNextRound(state);
    else throw new Error(`Unexpected simulation phase: ${state.phase}`);
  }

  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) throw new Error('Simulation ended without a winner');
  return { winnerPersonality: winner.personality, rounds: state.round, finalState: state };
}
