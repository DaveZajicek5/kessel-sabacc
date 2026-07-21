export type CardFamily = 'blood' | 'sand';
export type CardRank = 1 | 2 | 3 | 4 | 5 | 6 | 'impostor' | 'sylop';
export type DrawSource = 'draw' | 'discard';
export type AiPersonality = 'cautious' | 'balanced' | 'gambler' | 'analyst' | 'chaos';
export type AiDifficulty = 'casual' | 'standard' | 'expert';

export interface Card {
  id: string;
  family: CardFamily;
  rank: CardRank;
}

export interface Hand {
  blood: Card;
  sand: Card;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  isHuman: boolean;
  personality: AiPersonality;
  stock: number;
  pot: number;
  hand: Hand;
  eliminated: boolean;
}

export interface Piles {
  bloodDraw: Card[];
  sandDraw: Card[];
  bloodDiscard: Card[];
  sandDiscard: Card[];
}

export type GamePhase =
  | 'player-action'
  | 'draw-decision'
  | 'resolution-choice'
  | 'round-over'
  | 'game-over';

export interface PendingDraw {
  playerId: string;
  family: CardFamily;
  source: DrawSource;
  card: Card;
}

export interface ImpostorRolls {
  blood?: [number, number];
  sand?: [number, number];
}

export interface ImpostorChoices {
  blood?: number;
  sand?: number;
}

export interface ResolvedHand {
  blood: number;
  sand: number;
  difference: number;
  sum: number;
  isSabacc: boolean;
  isPureSabacc: boolean;
}

export interface RoundResult {
  playerId: string;
  hand: ResolvedHand;
  rank: number;
  winner: boolean;
  penalty: number;
  stockAfter: number;
  eliminated: boolean;
  impostorChoices: ImpostorChoices;
}

export interface GameConfig {
  opponentCount: 1 | 2 | 3;
  startingTokens: number;
  difficulty: AiDifficulty;
  seed?: number;
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  piles: Piles;
  round: number;
  turn: number;
  startingSeat: number;
  currentPlayerId: string;
  actedThisTurn: string[];
  stoodThisTurn: string[];
  phase: GamePhase;
  pendingDraw?: PendingDraw;
  resolutionRolls: Record<string, ImpostorRolls>;
  results: RoundResult[];
  log: string[];
  winnerId?: string;
  randomState: number;
}

export interface AiDecision {
  kind: 'stand' | 'draw';
  family?: CardFamily;
  source?: DrawSource;
  explanation: string;
}
