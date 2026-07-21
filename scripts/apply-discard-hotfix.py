from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch target: {label}")
    return text.replace(old, new, 1)


# Engine: visible discards are now a single atomic swap and empty sources never throw.
path = Path("src/game/engine.ts")
text = path.read_text()
marker = "export function beginDraw(state: GameState, family: CardFamily, source: DrawSource): GameState {"
take_discard = r'''export function takeDiscard(state: GameState, family: CardFamily): GameState {
  if (state.phase !== 'player-action') return state;
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player || player.stock <= 0) return player ? stand(state) : state;

  const key = `${family}Discard` as keyof Piles;
  const pile = state.piles[key];
  const visible = pile[pile.length - 1];
  if (!visible) {
    return {
      ...state,
      log: [...state.log, `${player.name} could not take the ${family} discard because the pile was empty.`].slice(-60),
    };
  }

  const replaced = player.hand[family];
  const piles: Piles = {
    ...state.piles,
    [key]: [...pile.slice(0, -1), replaced],
  };
  const players = state.players.map((candidate) =>
    candidate.id === player.id
      ? {
          ...candidate,
          stock: candidate.stock - 1,
          pot: candidate.pot + 1,
          hand: { ...candidate.hand, [family]: visible },
        }
      : candidate,
  );

  return completeAction(
    {
      ...state,
      players,
      piles,
      log: [
        ...state.log,
        `${player.name} spends a token, takes the visible ${family} ${cardLabel(visible)}, and discards ${cardLabel(replaced)}.`,
      ].slice(-60),
    },
    'draw',
  );
}

'''
text = replace_once(text, marker, take_discard + marker, "insert takeDiscard")
text = replace_once(
    text,
    "  const key = `${family}${source === 'draw' ? 'Draw' : 'Discard'}` as keyof Piles;\n  const selected = drawTop(state.piles[key]);",
    "  const key = `${family}${source === 'draw' ? 'Draw' : 'Discard'}` as keyof Piles;\n  const sourcePile = state.piles[key];\n  if (sourcePile.length === 0) {\n    return {\n      ...state,\n      log: [...state.log, `${player.name} could not draw because the ${family} ${source} pile was empty.`].slice(-60),\n    };\n  }\n  const selected = drawTop(sourcePile);",
    "guard empty draw source",
)
path.write_text(text)


# AI: a visible card is evaluated before spending, so commit it directly instead of reopening Keep/Refuse.
path = Path("src/game/ai.ts")
text = path.read_text()
text = replace_once(
    text,
    "import { beginDraw, finishDraw, getCurrentPlayer, getTopDiscard, stand } from './engine';",
    "import { beginDraw, finishDraw, getCurrentPlayer, getTopDiscard, stand, takeDiscard } from './engine';",
    "AI engine import",
)
text = replace_once(
    text,
    "  next = beginDraw(next, choice.decision.family!, choice.decision.source!);\n  const keepChoice = chooseAiKeep(next);",
    "  if (choice.decision.source === 'discard') {\n    return takeDiscard(next, choice.decision.family!);\n  }\n\n  next = beginDraw(next, choice.decision.family!, 'draw');\n  const keepChoice = chooseAiKeep(next);",
    "AI discard execution",
)
path.write_text(text)


# Browser UI: direct visible swaps, permanent diagnostics, and continuous state persistence.
path = Path("src/App.tsx")
text = path.read_text()
text = replace_once(
    text,
    "import { buildDebugReport } from './game/debug';",
    "import { buildDebugReport, copyDebugText, persistDebugState } from './game/debug';",
    "debug imports",
)
text = replace_once(
    text,
    "  stand,\n  startNextRound,\n} from './game/engine';",
    "  stand,\n  startNextRound,\n  takeDiscard,\n} from './game/engine';",
    "takeDiscard import",
)
text = replace_once(
    text,
    "<div><strong>Your turn</strong><p>Stand for free, or spend one token to draw from either family’s hidden draw pile or visible discard pile. Then keep or refuse the card.</p></div>",
    "<div><strong>Your turn</strong><p>Stand for free, spend one token to inspect a hidden draw and keep or refuse it, or swap a visible discard directly for your same-family card.</p></div>",
    "rules wording",
)
old_copy = r'''  const copyDebugReport = async () => {
    const report = buildDebugReport(state, window.location.href);
    try {
      await navigator.clipboard.writeText(report);
      setDebugStatus('Debug report copied. It includes hidden cards and the replay seed.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      setDebugStatus('Debug report copied using browser fallback.');
    }
  };'''
new_copy = r'''  const copyDebugReport = async () => {
    await copyDebugText(buildDebugReport(state, window.location.href));
    setDebugStatus('Copied');
    window.setTimeout(() => setDebugStatus(''), 1800);
  };'''
text = replace_once(text, old_copy, new_copy, "copy debug helper")
text = replace_once(
    text,
    "onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'discard') : prev)}",
    "onClick={() => setState((prev) => prev ? takeDiscard(prev, 'blood') : prev)}",
    "blood discard click",
)
text = text.replace("{bloodDiscard ? 'Take discard' : 'Discard empty'}", "{bloodDiscard ? 'Swap discard · 1 token' : 'Discard empty'}")
text = replace_once(
    text,
    "onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'discard') : prev)}",
    "onClick={() => setState((prev) => prev ? takeDiscard(prev, 'sand') : prev)}",
    "sand discard click",
)
text = text.replace("{sandDiscard ? 'Take discard' : 'Discard empty'}", "{sandDiscard ? 'Swap discard · 1 token' : 'Discard empty'}")
text = replace_once(
    text,
    "        <button className=\"text-button\" onClick={onRules}>Rules</button>",
    "        <div className=\"header-actions\">\n          <button className=\"text-button\" onClick={copyDebugReport}>{debugStatus || 'Copy debug'}</button>\n          <button className=\"text-button\" onClick={onRules}>Rules</button>\n        </div>",
    "header debug button",
)
text = replace_once(
    text,
    "  useEffect(() => {\n    if (!state || state.phase !== 'player-action') return;",
    "  useEffect(() => {\n    if (state) persistDebugState(state, window.location.href);\n  }, [state]);\n\n  useEffect(() => {\n    if (!state || state.phase !== 'player-action') return;",
    "persist state effect",
)
path.write_text(text)


# Debug utilities: retain the last good state and make clipboard export reusable from the crash screen.
path = Path("src/game/debug.ts")
text = path.read_text()
append = r'''

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
'''
if "const LAST_STATE_KEY" not in text:
    text += append
path.write_text(text)


# Crash boundary: export the actual exception plus the last successfully rendered state.
path = Path("src/main.tsx")
text = path.read_text()
text = replace_once(
    text,
    "import App from './App';",
    "import App from './App';\nimport { buildCrashReport, copyDebugText } from './game/debug';",
    "crash debug import",
)
text = replace_once(
    text,
    "class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {\n  state: { error: Error | null } = { error: null };",
    "class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; componentStack?: string; copied: boolean }> {\n  state: { error: Error | null; componentStack?: string; copied: boolean } = { error: null, copied: false };",
    "error boundary state",
)
text = replace_once(
    text,
    "  componentDidCatch(error: Error, info: ErrorInfo) {\n    console.error('Kessel Sabacc crashed', error, info);\n  }",
    "  componentDidCatch(error: Error, info: ErrorInfo) {\n    console.error('Kessel Sabacc crashed', error, info);\n    this.setState({ componentStack: info.componentStack ?? undefined });\n  }",
    "component stack storage",
)
text = replace_once(
    text,
    "            <button className=\"primary-button\" onClick={() => window.location.reload()}>Reload game</button>",
    "            <div className=\"modal-actions crash-actions\">\n              <button\n                className=\"secondary-button\"\n                onClick={async () => {\n                  await copyDebugText(buildCrashReport(this.state.error!, this.state.componentStack));\n                  this.setState({ copied: true });\n                }}\n              >\n                {this.state.copied ? 'Crash report copied' : 'Copy crash report'}\n              </button>\n              <button className=\"primary-button\" onClick={() => window.location.reload()}>Reload game</button>\n            </div>",
    "crash buttons",
)
path.write_text(text)


# Styles for the always-visible diagnostics controls.
path = Path("src/styles.css")
text = path.read_text()
if ".header-actions" not in text:
    text += r'''

.header-actions { display: flex; align-items: center; gap: 0.7rem; }
.crash-actions { justify-content: flex-start; flex-wrap: wrap; margin-top: 1rem; }
'''
path.write_text(text)


# Regression tests cover both families, the last token, and empty-pile safety.
path = Path("src/game/__tests__/engine.test.ts")
text = path.read_text()
text = replace_once(
    text,
    "import { beginDraw, createGame, finishDraw, getTopDiscard, stand } from '../engine';",
    "import { beginDraw, createGame, finishDraw, getTopDiscard, stand, takeDiscard } from '../engine';",
    "test import",
)
tests = r'''

  it.each(['blood', 'sand'] as const)('atomically swaps the visible %s discard with the final token', (family) => {
    const created = createGame({ opponentCount: 1, startingTokens: 1, difficulty: 'standard', seed: 31 });
    const initial = { ...created, startingSeat: 0, currentPlayerId: 'human' };
    const visible = getTopDiscard(initial, family)!;
    const oldCard = initial.players.find((player) => player.id === 'human')!.hand[family];

    const after = takeDiscard(initial, family);
    const human = after.players.find((player) => player.id === 'human')!;

    expect(human.stock).toBe(0);
    expect(human.pot).toBe(1);
    expect(human.hand[family]).toEqual(visible);
    expect(getTopDiscard(after, family)).toEqual(oldCard);
    expect(after.pendingDraw).toBeUndefined();
    expect(after.phase).not.toBe('draw-decision');
  });

  it.each(['blood', 'sand'] as const)('does not throw on an empty %s discard', (family) => {
    const created = createGame({ opponentCount: 1, startingTokens: 2, difficulty: 'standard', seed: 32 });
    const initial = {
      ...created,
      startingSeat: 0,
      currentPlayerId: 'human',
      piles: { ...created.piles, [`${family}Discard`]: [] },
    };

    expect(() => takeDiscard(initial, family)).not.toThrow();
    expect(takeDiscard(initial, family).phase).toBe('player-action');
  });
'''
end = text.rfind("\n});")
if end < 0:
    raise RuntimeError("Could not find engine test suite end")
text = text[:end] + tests + text[end:]
path.write_text(text)
