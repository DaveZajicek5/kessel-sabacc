from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch target: {label}")
    return text.replace(old, new, 1)


# Shared visible build identifier.
Path('src/build.ts').write_text("export const BUILD_ID = '2026.07.21-discard-guard-1';\n")


# Make turn advancement robust against incomplete or duplicated action history.
path = Path('src/game/engine.ts')
text = path.read_text()
start = text.index("function completeAction(state: GameState, kind: 'stand' | 'draw'): GameState {")
end = text.index("\nexport function stand", start)
replacement = r'''function completeAction(state: GameState, kind: 'stand' | 'draw'): GameState {
  const playerId = state.currentPlayerId;
  const order = clockwiseOrder(state.players, state.startingSeat);
  if (order.length === 0) return state;

  const actedIds = new Set([...state.actedThisTurn, playerId]);
  const stoodIds = new Set(state.stoodThisTurn);
  if (kind === 'stand') stoodIds.add(playerId);

  // Keep histories unique and in table order. Duplicate browser events or a stale
  // action history must never make currentPlayerId become undefined.
  const actedThisTurn = order.filter((player) => actedIds.has(player.id)).map((player) => player.id);
  const stoodThisTurn = order.filter((player) => stoodIds.has(player.id)).map((player) => player.id);

  if (actedThisTurn.length >= order.length) {
    if (stoodThisTurn.length >= order.length) {
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
  const traversal = currentIndex >= 0
    ? [...order.slice(currentIndex + 1), ...order.slice(0, currentIndex + 1)]
    : order;
  const nextPlayer = traversal.find((player) => !actedIds.has(player.id));

  // This should be unreachable, but retaining a valid current player is safer
  // than throwing during React's state update/render cycle.
  if (!nextPlayer) {
    return {
      ...state,
      actedThisTurn,
      stoodThisTurn,
      currentPlayerId: order[0].id,
      log: [...state.log, 'Turn order recovered from an inconsistent action history.'].slice(-60),
    };
  }

  return {
    ...state,
    actedThisTurn,
    stoodThisTurn,
    currentPlayerId: nextPlayer.id,
  };
}

export function assertValidGameState(state: GameState): void {
  if (!Array.isArray(state.players) || state.players.length === 0) {
    throw new Error('Game state has no players');
  }
  if (!state.players.some((player) => player.id === state.currentPlayerId)) {
    throw new Error(`Current player ${state.currentPlayerId} is missing`);
  }
  for (const player of state.players) {
    if (!player.hand?.blood || !player.hand?.sand) {
      throw new Error(`Player ${player.id} has an incomplete hand`);
    }
  }
  for (const key of ['bloodDraw', 'sandDraw', 'bloodDiscard', 'sandDiscard'] as const) {
    if (!Array.isArray(state.piles[key])) throw new Error(`Pile ${key} is invalid`);
  }
}
'''
text = text[:start] + replacement + text[end:]
path.write_text(text)


# Include build id and action-specific incident reports in diagnostics.
path = Path('src/game/debug.ts')
text = path.read_text()
text = replace_once(
    text,
    "import { cardLabel } from './deck';",
    "import { BUILD_ID } from '../build';\nimport { cardLabel } from './deck';",
    'debug build import',
)
text = replace_once(
    text,
    "    format: 'kessel-sabacc-debug-v1',",
    "    format: 'kessel-sabacc-debug-v1',\n    buildId: BUILD_ID,",
    'debug build id',
)
if 'buildActionIncidentReport' not in text:
    text += r'''

export function buildActionIncidentReport(
  state: GameState,
  action: Record<string, unknown>,
  error: Error,
  pageUrl?: string,
): string {
  let stateSnapshot: unknown;
  try {
    stateSnapshot = JSON.parse(buildDebugReport(state, pageUrl));
  } catch {
    stateSnapshot = { unavailable: true };
  }

  return JSON.stringify({
    format: 'kessel-sabacc-action-incident-v1',
    buildId: BUILD_ID,
    generatedAt: new Date().toISOString(),
    action,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    stateBeforeAction: stateSnapshot,
  }, null, 2);
}
'''
path.write_text(text)


# Guard discard event handlers and expose a copyable non-fatal incident modal.
path = Path('src/App.tsx')
text = path.read_text()
text = replace_once(
    text,
    "import { useEffect, useMemo, useState } from 'react';",
    "import { useEffect, useMemo, useRef, useState } from 'react';\nimport { BUILD_ID } from './build';",
    'React/build imports',
)
text = replace_once(
    text,
    "import { buildDebugReport, copyDebugText, persistDebugState } from './game/debug';",
    "import { buildActionIncidentReport, buildDebugReport, copyDebugText, persistDebugState } from './game/debug';",
    'incident debug import',
)
text = replace_once(
    text,
    "  beginDraw,\n  createGame,",
    "  assertValidGameState,\n  beginDraw,\n  createGame,",
    'state validator import',
)
text = replace_once(
    text,
    "  const [debugStatus, setDebugStatus] = useState('');",
    "  const [debugStatus, setDebugStatus] = useState('');\n  const [incidentReport, setIncidentReport] = useState<string | null>(null);\n  const actionLock = useRef(false);",
    'incident state',
)
needle = "  const copyDebugReport = async () => {\n    await copyDebugText(buildDebugReport(state, window.location.href));\n    setDebugStatus('Copied');\n    window.setTimeout(() => setDebugStatus(''), 1800);\n  };"
replacement = needle + r'''

  const performDiscardSwap = (family: CardFamily) => {
    if (actionLock.current) return;
    actionLock.current = true;
    const before = state;
    persistDebugState(before, window.location.href);

    try {
      const next = takeDiscard(before, family);
      assertValidGameState(next);
      setState(next);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setIncidentReport(buildActionIncidentReport(
        before,
        { kind: 'take-visible-discard', family },
        error,
        window.location.href,
      ));
    } finally {
      window.setTimeout(() => { actionLock.current = false; }, 0);
    }
  };'''
text = replace_once(text, needle, replacement, 'guarded discard handler')
text = text.replace("onClick={() => setState((prev) => prev ? takeDiscard(prev, 'blood') : prev)}", "onClick={() => performDiscardSwap('blood')}")
text = text.replace("onClick={() => setState((prev) => prev ? takeDiscard(prev, 'sand') : prev)}", "onClick={() => performDiscardSwap('sand')}")
text = replace_once(
    text,
    "          <button className=\"text-button\" onClick={copyDebugReport}>{debugStatus || 'Copy debug'}</button>",
    "          <small className=\"build-id\">{BUILD_ID}</small>\n          <button className=\"text-button\" onClick={copyDebugReport}>{debugStatus || 'Copy debug'}</button>",
    'visible build id',
)
modal = r'''

      {incidentReport && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Discard action incident">
          <section className="modal incident-modal">
            <p className="eyebrow">ACTION BLOCKED</p>
            <h2>The discard swap failed safely.</h2>
            <p>The table was left exactly as it was before the click. Copy the report and send it to the developer.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => copyDebugText(incidentReport)}>Copy incident report</button>
              <button className="primary-button" onClick={() => setIncidentReport(null)}>Return to table</button>
            </div>
            <details>
              <summary>Technical detail</summary>
              <pre>{incidentReport}</pre>
            </details>
          </section>
        </div>
      )}
'''
text = replace_once(text, "\n      {state.phase === 'resolution-choice'", modal + "\n      {state.phase === 'resolution-choice'", 'incident modal')
path.write_text(text)


# Add build id to the fatal crash page as well.
path = Path('src/main.tsx')
text = path.read_text()
text = replace_once(text, "import App from './App';", "import App from './App';\nimport { BUILD_ID } from './build';", 'main build import')
text = replace_once(
    text,
    "            <p className=\"eyebrow\">TABLE MALFUNCTION</p>",
    "            <p className=\"eyebrow\">TABLE MALFUNCTION · {BUILD_ID}</p>",
    'crash build id',
)
path.write_text(text)


# Minimal styles.
path = Path('src/styles.css')
text = path.read_text()
if '.build-id' not in text:
    text += r'''

.build-id { opacity: 0.55; font-size: 0.68rem; font-family: ui-monospace, monospace; }
.incident-modal pre { max-height: 14rem; overflow: auto; white-space: pre-wrap; font-size: 0.7rem; }
'''
path.write_text(text)


# Regression: an incomplete history with the current player last used to dereference undefined.
path = Path('src/game/__tests__/engine.test.ts')
text = path.read_text()
if 'recovers when the current player is last' not in text:
    insertion = r'''

  it.each(['blood', 'sand'] as const)('recovers when the current player is last but action history is incomplete for %s discard', (family) => {
    const created = createGame({ opponentCount: 3, startingTokens: 3, difficulty: 'standard', seed: 77 });
    const malformed = {
      ...created,
      startingSeat: 1,
      currentPlayerId: 'human',
      actedThisTurn: [],
      stoodThisTurn: [],
    };

    const after = takeDiscard(malformed, family);
    expect(after.players.some((player) => player.id === after.currentPlayerId)).toBe(true);
    expect(after.currentPlayerId).not.toBe('human');
  });
'''
    marker = text.rfind('\n});')
    if marker < 0:
        raise RuntimeError('Missing engine test suite end')
    text = text[:marker] + insertion + text[marker:]
path.write_text(text)
