import { cardLabel } from './deck';
import type { Card, GameState } from './types';

function cardSnapshot(card: Card) {
  return {
    id: card.id,
    family: card.family,
    rank: card.rank,
    label: cardLabel(card),
  };
}

export function buildDebugReport(state: GameState, pageUrl?: string): string {
  const seed = state.config.seed;
  const replayUrl = seed !== undefined && pageUrl
    ? `${pageUrl.split('?')[0]}?seed=${seed}`
    : undefined;

  const report = {
    format: 'kessel-sabacc-debug-v1',
    generatedAt: new Date().toISOString(),
    replayUrl,
    config: state.config,
    phase: state.phase,
    round: state.round,
    turn: state.turn,
    startingSeat: state.startingSeat,
    currentPlayerId: state.currentPlayerId,
    randomState: state.randomState,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      isHuman: player.isHuman,
      personality: player.personality,
      stock: player.stock,
      pot: player.pot,
      eliminated: player.eliminated,
      hand: {
        blood: cardSnapshot(player.hand.blood),
        sand: cardSnapshot(player.hand.sand),
      },
    })),
    piles: {
      bloodDraw: state.piles.bloodDraw.map(cardSnapshot),
      sandDraw: state.piles.sandDraw.map(cardSnapshot),
      bloodDiscard: state.piles.bloodDiscard.map(cardSnapshot),
      sandDiscard: state.piles.sandDiscard.map(cardSnapshot),
    },
    pendingDraw: state.pendingDraw
      ? { ...state.pendingDraw, card: cardSnapshot(state.pendingDraw.card) }
      : undefined,
    resolutionRolls: state.resolutionRolls,
    results: state.results,
    publicLog: state.log,
  };

  return JSON.stringify(report, null, 2);
}


const LAST_STATE_KEY = 'kessel-sabacc:last-debug-state-v1';

export function persistDebugState(state: GameState, pageUrl?: string): void {
  try {
    window.sessionStorage.setItem(LAST_STATE_KEY, buildDebugReport(state, pageUrl));
  } catch {
    // Diagnostics must never interfere with play.
  }
}

export function buildCrashReport(error: Error, componentStack?: string): string {
  let lastState: unknown;
  try {
    const raw = window.sessionStorage.getItem(LAST_STATE_KEY);
    lastState = raw ? JSON.parse(raw) : undefined;
  } catch {
    lastState = undefined;
  }

  return JSON.stringify({
    format: 'kessel-sabacc-crash-v1',
    generatedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    userAgent: window.navigator.userAgent,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack,
    },
    lastState,
  }, null, 2);
}

export async function copyDebugText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}
