import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let text = readFileSync(path, 'utf8');

function replaceOnce(target, replacement, label) {
  if (!text.includes(target)) throw new Error(`Missing target: ${label}`);
  text = text.replace(target, replacement);
}

replaceOnce(
  "import { executeAiTurn } from './game/ai';\n",
  "import { executeAiTurn } from './game/ai';\nimport { buildDebugReport } from './game/debug';\n",
  'debug import',
);
replaceOnce(
  "} from './game/engine';\nimport type {",
  "} from './game/engine';\nimport { normalizeSeed } from './game/random';\nimport type {",
  'random import',
);
replaceOnce(
  "          <div><strong>Current scope</strong><p>Shift tokens and cheating mechanics are intentionally excluded from this first rules-complete core.</p></div>",
  "          <div><strong>Diagnostics</strong><p>After each round you can copy a local debug report containing the seed, full deal, AI state and table log. Nothing is transmitted automatically.</p></div>",
  'rules diagnostics',
);
replaceOnce(
  "function SetupScreen({ onStart, onRules }: { onStart: (config: GameConfig) => void; onRules: () => void }) {",
  "function seedFromQuery(): number | undefined {\n  const raw = new URLSearchParams(window.location.search).get('seed');\n  if (raw === null || raw.trim() === '') return undefined;\n  const value = Number(raw);\n  return Number.isFinite(value) ? normalizeSeed(value) : undefined;\n}\n\nfunction SetupScreen({ onStart, onRules }: { onStart: (config: GameConfig) => void; onRules: () => void }) {",
  'seed parser',
);
replaceOnce(
  "  const [difficulty, setDifficulty] = useState<GameConfig['difficulty']>('standard');\n",
  "  const [difficulty, setDifficulty] = useState<GameConfig['difficulty']>('standard');\n  const [replaySeed] = useState(seedFromQuery);\n",
  'replay seed state',
);
replaceOnce(
  "        <p className=\"hero-copy\">A complete core-rules game against fair-information computer opponents with distinct risk personalities.</p>\n",
  "        <p className=\"hero-copy\">A complete core-rules game against fair-information computer opponents with distinct risk personalities.</p>\n        {replaySeed !== undefined && <p className=\"replay-seed\">Replaying deterministic seed <strong>{replaySeed}</strong>.</p>}\n",
  'replay seed notice',
);
replaceOnce(
  "          <button className=\"primary-button\" onClick={() => onStart({ opponentCount: opponents, startingTokens: tokens, difficulty })}>Take a seat</button>",
  "          <button className=\"primary-button\" onClick={() => onStart({ opponentCount: opponents, startingTokens: tokens, difficulty, seed: replaySeed ?? normalizeSeed(Date.now()) })}>Take a seat</button>",
  'seeded start button',
);
replaceOnce(
  "  const [choices, setChoices] = useState<ImpostorChoices>({});\n",
  "  const [choices, setChoices] = useState<ImpostorChoices>({});\n  const [debugStatus, setDebugStatus] = useState('');\n",
  'debug status',
);
replaceOnce(
  "  const sandDiscard = getTopDiscard(state, 'sand');\n\n  return (",
  "  const sandDiscard = getTopDiscard(state, 'sand');\n\n  const copyDebugReport = async () => {\n    const report = buildDebugReport(state, window.location.href);\n    try {\n      await navigator.clipboard.writeText(report);\n      setDebugStatus('Debug report copied. It includes hidden cards and the replay seed.');\n    } catch {\n      const textarea = document.createElement('textarea');\n      textarea.value = report;\n      textarea.style.position = 'fixed';\n      textarea.style.opacity = '0';\n      document.body.appendChild(textarea);\n      textarea.select();\n      document.execCommand('copy');\n      textarea.remove();\n      setDebugStatus('Debug report copied using browser fallback.');\n    }\n  };\n\n  return (",
  'copy debug function',
);
replaceOnce(
  "            <button className=\"primary-button\" onClick={() => setState((prev) => prev ? startNextRound(prev) : prev)}>Deal next round</button>",
  "            <p className=\"debug-seed\">Seed: <code>{state.config.seed ?? 'not recorded'}</code></p>\n            <div className=\"modal-actions\">\n              <button className=\"secondary-button\" onClick={copyDebugReport}>Copy debug report</button>\n              <button className=\"primary-button\" onClick={() => setState((prev) => prev ? startNextRound(prev) : prev)}>Deal next round</button>\n            </div>\n            {debugStatus && <p className=\"debug-status\">{debugStatus}</p>}",
  'round debug controls',
);
replaceOnce(
  "            <button className=\"primary-button\" onClick={onExit}>New game</button>",
  "            <p className=\"debug-seed\">Seed: <code>{state.config.seed ?? 'not recorded'}</code></p>\n            <div className=\"modal-actions\">\n              <button className=\"secondary-button\" onClick={copyDebugReport}>Copy debug report</button>\n              <button className=\"primary-button\" onClick={onExit}>New game</button>\n            </div>\n            {debugStatus && <p className=\"debug-status\">{debugStatus}</p>}",
  'game debug controls',
);

writeFileSync(path, text);
