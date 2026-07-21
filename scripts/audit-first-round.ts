import { executeAiTurn } from '../src/game/ai';
import { createGame, finalizeResolution } from '../src/game/engine';
import { handStrength } from '../src/game/scoring';
import type { AiDifficulty, CardRank, GameState, Player } from '../src/game/types';

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const games = Number(argValue('--games') ?? '50000');
const difficulty = (argValue('--difficulty') ?? 'standard') as AiDifficulty;

if (!Number.isInteger(games) || games <= 0) {
  throw new Error('Use --games followed by a positive integer.');
}
if (!['casual', 'standard', 'expert'].includes(difficulty)) {
  throw new Error('Use --difficulty casual, standard, or expert.');
}

interface SeatStats {
  name: string;
  personality: string;
  openingStrength: number;
  openingNumericSabacc: number;
  openingImpostors: number;
  openingSylops: number;
  starts: number;
  draws: number;
  soleWins: number;
  winAppearances: number;
  fractionalWins: number;
  rankCounts: Record<string, number>;
}

const stats = new Map<number, SeatStats>();
let tiedRounds = 0;
let totalActions = 0;

function rankKey(rank: CardRank): string {
  return String(rank);
}

function getStats(player: Player): SeatStats {
  let entry = stats.get(player.seat);
  if (!entry) {
    entry = {
      name: player.name,
      personality: player.personality,
      openingStrength: 0,
      openingNumericSabacc: 0,
      openingImpostors: 0,
      openingSylops: 0,
      starts: 0,
      draws: 0,
      soleWins: 0,
      winAppearances: 0,
      fractionalWins: 0,
      rankCounts: {},
    };
    stats.set(player.seat, entry);
  }
  return entry;
}

function makeAllAi(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.isHuman ? { ...player, isHuman: false, personality: 'balanced' } : player,
    ),
  };
}

for (let seed = 1; seed <= games; seed += 1) {
  let state = createGame({
    opponentCount: 3,
    startingTokens: 5,
    difficulty,
    seed,
  });

  for (const player of state.players) {
    const entry = getStats(player);
    entry.openingStrength += handStrength(player.hand);
    if (
      typeof player.hand.blood.rank === 'number'
      && player.hand.blood.rank === player.hand.sand.rank
    ) {
      entry.openingNumericSabacc += 1;
    }
    for (const card of [player.hand.blood, player.hand.sand]) {
      if (card.rank === 'impostor') entry.openingImpostors += 1;
      if (card.rank === 'sylop') entry.openingSylops += 1;
      const key = `${card.family}:${rankKey(card.rank)}`;
      entry.rankCounts[key] = (entry.rankCounts[key] ?? 0) + 1;
    }
    if (player.seat === state.startingSeat) entry.starts += 1;
  }

  state = makeAllAi(state);
  let safety = 0;
  while (state.phase === 'player-action') {
    state = executeAiTurn(state);
    totalActions += 1;
    safety += 1;
    if (safety > 20) throw new Error(`First round exceeded safety limit at seed ${seed}`);
  }
  if (state.phase !== 'resolution-choice') {
    throw new Error(`Unexpected first-round phase ${state.phase} at seed ${seed}`);
  }

  for (const player of state.players) getStats(player).draws += player.pot;
  state = finalizeResolution(state);

  const winners = state.results.filter((result) => result.winner);
  if (winners.length > 1) tiedRounds += 1;
  for (const result of winners) {
    const player = state.players.find((candidate) => candidate.id === result.playerId);
    if (!player) throw new Error(`Missing winner ${result.playerId}`);
    const entry = getStats(player);
    entry.winAppearances += 1;
    entry.fractionalWins += 1 / winners.length;
    if (winners.length === 1) entry.soleWins += 1;
  }
}

console.log(`FIRST ROUND AUDIT`);
console.log(`games=${games} difficulty=${difficulty} seeds=1..${games}`);
console.log(`ties=${(tiedRounds / games * 100).toFixed(2)}% avg_actions=${(totalActions / games).toFixed(2)}`);
console.log('');
console.log('seat player personality start% opening_strength numeric_sabacc% impostor_cards/hand sylop_cards/hand avg_draws fractional_win% sole_win% appearance%');
for (const [seat, entry] of [...stats.entries()].sort(([a], [b]) => a - b)) {
  console.log([
    seat,
    entry.name.padEnd(5),
    entry.personality.padEnd(9),
    (entry.starts / games * 100).toFixed(2).padStart(6),
    (entry.openingStrength / games).toFixed(3).padStart(8),
    (entry.openingNumericSabacc / games * 100).toFixed(2).padStart(6),
    (entry.openingImpostors / games).toFixed(4).padStart(7),
    (entry.openingSylops / games).toFixed(4).padStart(7),
    (entry.draws / games).toFixed(3).padStart(7),
    (entry.fractionalWins / games * 100).toFixed(2).padStart(7),
    (entry.soleWins / games * 100).toFixed(2).padStart(7),
    (entry.winAppearances / games * 100).toFixed(2).padStart(7),
  ].join(' '));
}

console.log('');
console.log('Opening rank frequencies by seat (each family should converge to deck composition):');
for (const [seat, entry] of [...stats.entries()].sort(([a], [b]) => a - b)) {
  const frequencies = Object.entries(entry.rankCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rank, count]) => `${rank}=${(count / games * 100).toFixed(2)}%`)
    .join(' ');
  console.log(`seat ${seat} ${entry.name}: ${frequencies}`);
}
