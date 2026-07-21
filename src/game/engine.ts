import { cardLabel, shuffledFamilyDeck } from './deck';
import { normalizeSeed, randomInt } from './random';
import {
  chooseBestImpostorValues,
  rankResolvedHands,
  resolveHand,
} from './scoring';
import type {
  AiPersonality,
  Card,
  CardFamily,
  DrawSource,
  GameConfig,
  GameState,
  Hand,
  ImpostorChoices,
  Piles,
  Player,
  RoundResult,
} from './types';

const opponents: Array<{ name: string; personality: AiPersonality }> = [
  { name: 'Vexa', personality: 'analyst' },
  { name: 'Brakk', personality: 'gambler' },
  { name: 'Mira', personality: 'cautious' },
];

function placeholderHand(): Hand {
  return {
    blood: { id: 'placeholder-blood', family: 'blood', rank: 1 },
    sand: { id: 'placeholder-sand', family: 'sand', rank: 1 },
  };
}

function activePlayers(players: Player[]): Player[] {
  return players.filter((player) => !player.eliminated).sort((a, b) => a.seat - b.seat);
}

function activePlayerAtSeat(players: Player[], seat: number): Player {
  const player = players.find((candidate) => candidate.seat === seat && !candidate.eliminated);
  if (!player) throw new Error(`No active player at seat ${seat}`);
  return player;
}

function nextActiveSeat(players: Player[], fromSeat: number): number {
  const active = activePlayers(players);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const seat = (fromSeat + offset) % players.length;
    if (active.some((player) => player.seat === seat)) return seat;
  }
  return active[0].seat;
}

function clockwiseOrder(players: Player[], startingSeat: number): Player[] {
  const active = activePlayers(players);
  return [...active].sort((a, b) => {
    const aDistance = (a.seat - startingSeat + players.length) % players.length;
    const bDistance = (b.seat - startingSeat + players.length) % players.length;
    return aDistance - bDistance;
  });
}

function drawTop(cards: Card[]): { card: Card; rest: Card[] } {
  const rest = [...cards];
  const card = rest.pop();
  if (!card) throw new Error('Attempted to draw from an empty pile');
  return { card, rest };
}

function buildRound(
  players: Player[],
  startingSeat: number,
  round: number,
  randomState: number,
  log: string[],
  config: GameConfig,
): GameState {
  const blood = shuffledFamilyDeck('blood', randomState);
  const sand = shuffledFamilyDeck('sand', blood.state);
  let bloodCards = blood.cards;
  let sandCards = sand.cards;
  const updatedPlayers = players.map((player) => ({ ...player, pot: 0 }));

  for (const player of activePlayers(updatedPlayers)) {
    const bloodDraw = drawTop(bloodCards);
    bloodCards = bloodDraw.rest;
    const sandDraw = drawTop(sandCards);
    sandCards = sandDraw.rest;
    const target = updatedPlayers.find((candidate) => candidate.id === player.id);
    if (target) target.hand = { blood: bloodDraw.card, sand: sandDraw.card };
  }

  const bloodDiscard = drawTop(bloodCards);
  bloodCards = bloodDiscard.rest;
  const sandDiscard = drawTop(sandCards);
  sandCards = sandDiscard.rest;

  const piles: Piles = {
    bloodDraw: bloodCards,
    sandDraw: sandCards,
    bloodDiscard: [bloodDiscard.card],
    sandDiscard: [sandDiscard.card],
  };
  const starter = activePlayerAtSeat(updatedPlayers, startingSeat);

  return {
    config,
    players: updatedPlayers,
    piles,
    round,
    turn: 1,
    startingSeat,
    currentPlayerId: starter.id,
    actedThisTurn: [],
    stoodThisTurn: [],
    phase: 'player-action',
    resolutionRolls: {},
    results: [],
    log: [
      ...log,
      `Round ${round} begins. ${starter.name} acts first.`,
      `Discard piles show Blood ${cardLabel(bloodDiscard.card)} and Sand ${cardLabel(sandDiscard.card)}.`,
    ].slice(-60),
    randomState: sand.state,
  };
}

export function createGame(config: GameConfig): GameState {
  const seed = normalizeSeed(config.seed ?? Date.now());
  const players: Player[] = [
    {
      id: 'human',
      name: 'You',
      seat: 0,
      isHuman: true,
      personality: 'balanced',
      stock: config.startingTokens,
      pot: 0,
      hand: placeholderHand(),
      eliminated: false,
    },
    ...opponents.slice(0, config.opponentCount).map((opponent, index) => ({
      id: `ai-${index + 1}`,
      name: opponent.name,
      seat: index + 1,
      isHuman: false,
      personality: opponent.personality,
      stock: config.startingTokens,
      pot: 0,
      hand: placeholderHand(),
      eliminated: false,
    })),
  ];
  const starterRoll = randomInt(seed, 0, players.length - 1);
  return buildRound(players, starterRoll.value, 1, starterRoll.state, ['Welcome to the table.'], config);
}

function updatePile(piles: Piles, family: CardFamily, source: DrawSource, cards: Card[]): Piles {
  const key = `${family}${source === 'draw' ? 'Draw' : 'Discard'}` as keyof Piles;
  return { ...piles, [key]: cards };
}

function addToDiscard(piles: Piles, card: Card): Piles {
  const key = `${card.family}Discard` as keyof Piles;
  return { ...piles, [key]: [...piles[key], card] };
}

function beginResolution(state: GameState, reason: string): GameState {
  let randomState = state.randomState;
  const resolutionRolls: GameState['resolutionRolls'] = {};
  for (const player of activePlayers(state.players)) {
    const rolls: GameState['resolutionRolls'][string] = {};
    for (const family of ['blood', 'sand'] as const) {
      if (player.hand[family].rank !== 'impostor') continue;
      const first = randomInt(randomState, 1, 6);
      const second = randomInt(first.state, 1, 6);
      randomState = second.state;
      rolls[family] = [first.value, second.value];
    }
    resolutionRolls[player.id] = rolls;
  }
  return {
    ...state,
    phase: 'resolution-choice',
    resolutionRolls,
    randomState,
    pendingDraw: undefined,
    log: [...state.log, reason, 'Hands are revealed for resolution.'].slice(-60),
  };
}

function completeAction(state: GameState, kind: 'stand' | 'draw'): GameState {
  const playerId = state.currentPlayerId;
  const actedThisTurn = [...state.actedThisTurn, playerId];
  const stoodThisTurn = kind === 'stand' ? [...state.stoodThisTurn, playerId] : state.stoodThisTurn;
  const order = clockwiseOrder(state.players, state.startingSeat);

  if (actedThisTurn.length === order.length) {
    if (stoodThisTurn.length === order.length) {
      return beginResolution(
        { ...state, actedThisTurn, stoodThisTurn },
        `Everyone stood on turn ${state.turn}; the round ends early.`,
      );
    }
    if (state.turn >= 3) {
      return beginResolution(
        { ...state, actedThisTurn, stoodThisTurn },
        'The third turn is complete.',
      );
    }
    return {
      ...state,
      turn: state.turn + 1,
      currentPlayerId: order[0].id,
      actedThisTurn: [],
      stoodThisTurn: [],
      log: [...state.log, `Turn ${state.turn + 1} begins.`].slice(-60),
    };
  }

  const currentIndex = order.findIndex((player) => player.id === playerId);
  return {
    ...state,
    actedThisTurn,
    stoodThisTurn,
    currentPlayerId: order[currentIndex + 1].id,
  };
}

export function stand(state: GameState): GameState {
  if (state.phase !== 'player-action') return state;
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player) return state;
  return completeAction(
    { ...state, log: [...state.log, `${player.name} stands.`].slice(-60) },
    'stand',
  );
}

export function beginDraw(state: GameState, family: CardFamily, source: DrawSource): GameState {
  if (state.phase !== 'player-action') return state;
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player || player.stock <= 0) return stand(state);

  const key = `${family}${source === 'draw' ? 'Draw' : 'Discard'}` as keyof Piles;
  const selected = drawTop(state.piles[key]);
  // Hidden draws are removed immediately. Visible discards stay on the table
  // until Keep/Refuse is resolved, so the move is committed atomically.
  const piles = source === 'draw'
    ? updatePile(state.piles, family, source, selected.rest)
    : state.piles;
  const players = state.players.map((candidate) =>
    candidate.id === player.id
      ? { ...candidate, stock: candidate.stock - 1, pot: candidate.pot + 1 }
      : candidate,
  );

  return {
    ...state,
    players,
    piles,
    phase: 'draw-decision',
    pendingDraw: { playerId: player.id, family, source, card: selected.card },
    log: [
      ...state.log,
      `${player.name} spends a token and draws from the ${family} ${source} pile.`,
    ].slice(-60),
  };
}

export function finishDraw(state: GameState, keep: boolean): GameState {
  if (state.phase !== 'draw-decision' || !state.pendingDraw) return state;
  const pending = state.pendingDraw;
  const player = state.players.find((candidate) => candidate.id === pending.playerId);
  if (!player) return state;

  let piles = state.piles;
  let players = state.players;
  let detail: string;

  // Remove a visible discard only when the player actually keeps it.
  // Refusing it leaves the pile unchanged.
  if (pending.source === 'discard' && keep) {
    const key = `${pending.family}Discard` as keyof Piles;
    const top = drawTop(piles[key]);
    if (top.card.id !== pending.card.id) {
      throw new Error('Visible discard changed before the draw was resolved');
    }
    piles = updatePile(piles, pending.family, 'discard', top.rest);
  }

  if (keep) {
    const replaced = player.hand[pending.family];
    piles = addToDiscard(piles, replaced);
    players = players.map((candidate) =>
      candidate.id === player.id
        ? { ...candidate, hand: { ...candidate.hand, [pending.family]: pending.card } }
        : candidate,
    );
    detail = pending.source === 'discard'
      ? `${player.name} takes the visible ${cardLabel(pending.card)}.`
      : `${player.name} keeps the hidden card and discards ${cardLabel(replaced)}.`;
  } else {
    if (pending.source === 'draw') {
      piles = addToDiscard(piles, pending.card);
      detail = `${player.name} refuses the hidden card; ${cardLabel(pending.card)} is now visible.`;
    } else {
      detail = `${player.name} leaves the visible ${cardLabel(pending.card)} on the discard pile.`;
    }
  }

  return completeAction(
    {
      ...state,
      players,
      piles,
      phase: 'player-action',
      pendingDraw: undefined,
      log: [...state.log, detail].slice(-60),
    },
    'draw',
  );
}

export function humanNeedsImpostorChoice(state: GameState): boolean {
  if (state.phase !== 'resolution-choice') return false;
  const human = state.players.find((player) => player.isHuman && !player.eliminated);
  if (!human) return false;
  return human.hand.blood.rank === 'impostor' || human.hand.sand.rank === 'impostor';
}

export function finalizeResolution(
  state: GameState,
  humanChoices: ImpostorChoices = {},
): GameState {
  if (state.phase !== 'resolution-choice') return state;
  const resolvedEntries = activePlayers(state.players).map((player) => {
    const choices = player.isHuman
      ? humanChoices
      : chooseBestImpostorValues(player.hand, state.resolutionRolls[player.id] ?? {});
    return { playerId: player.id, hand: resolveHand(player.hand, choices), choices };
  });
  const ranked = rankResolvedHands(resolvedEntries);
  const rankedById = new Map(ranked.map((entry) => [entry.playerId, entry]));

  const players = state.players.map((player) => {
    if (player.eliminated) return player;
    const ranking = rankedById.get(player.id);
    if (!ranking) return player;
    const penalty = ranking.winner ? 0 : ranking.hand.isSabacc ? 1 : ranking.hand.difference;
    const stockAfter = ranking.winner ? player.stock + player.pot : player.stock - penalty;
    return { ...player, stock: stockAfter, pot: 0, eliminated: stockAfter <= 0 };
  });

  const results: RoundResult[] = ranked
    .map((ranking) => {
      const player = players.find((candidate) => candidate.id === ranking.playerId)!;
      const penalty = ranking.winner ? 0 : ranking.hand.isSabacc ? 1 : ranking.hand.difference;
      return {
        ...ranking,
        penalty,
        stockAfter: player.stock,
        eliminated: player.eliminated,
      };
    })
    .sort((a, b) => {
      const aSeat = players.find((player) => player.id === a.playerId)?.seat ?? 0;
      const bSeat = players.find((player) => player.id === b.playerId)?.seat ?? 0;
      return aSeat - bSeat;
    });

  const winners = results.filter((result) => result.winner).map((result) => {
    return players.find((player) => player.id === result.playerId)?.name ?? result.playerId;
  });
  const survivors = activePlayers(players);
  const log = [
    ...state.log,
    `${winners.join(' and ')} ${winners.length === 1 ? 'wins' : 'win'} the round.`,
    ...results
      .filter((result) => result.penalty > 0)
      .map((result) => {
        const name = players.find((player) => player.id === result.playerId)?.name ?? result.playerId;
        return `${name} loses ${result.penalty} penalty token${result.penalty === 1 ? '' : 's'}.`;
      }),
  ].slice(-60);

  if (survivors.length === 1) {
    return {
      ...state,
      players,
      results,
      phase: 'game-over',
      winnerId: survivors[0].id,
      log: [...log, `${survivors[0].name} wins the game.`].slice(-60),
    };
  }

  return { ...state, players, results, phase: 'round-over', log };
}

export function startNextRound(state: GameState): GameState {
  if (state.phase !== 'round-over') return state;
  const startingSeat = nextActiveSeat(state.players, state.startingSeat);
  return buildRound(
    state.players,
    startingSeat,
    state.round + 1,
    state.randomState,
    state.log,
    state.config,
  );
}

export function getCurrentPlayer(state: GameState): Player {
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player) throw new Error('Current player is missing');
  return player;
}

export function getTopDiscard(state: GameState, family: CardFamily): Card | undefined {
  const pile = state.piles[`${family}Discard` as keyof Piles];
  return pile[pile.length - 1];
}
