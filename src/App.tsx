import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILD_ID } from './build';
import { executeAiTurn } from './game/ai';
import { buildActionIncidentReport, buildDebugReport, copyDebugText, persistDebugState } from './game/debug';
import { cardLabel } from './game/deck';
import {
  assertValidGameState,
  beginDraw,
  createGame,
  finalizeResolution,
  finishDraw,
  getCurrentPlayer,
  getTopDiscard,
  humanNeedsImpostorChoice,
  stand,
  startNextRound,
  takeDiscard,
} from './game/engine';
import { normalizeSeed } from './game/random';
import type {
  Card,
  CardFamily,
  GameConfig,
  GameState,
  ImpostorChoices,
  Player,
  RoundResult,
} from './game/types';

function CardView({ card, hidden = false, compact = false }: { card: Card; hidden?: boolean; compact?: boolean }) {
  if (hidden) {
    return <div className={`card card-back ${compact ? 'compact' : ''}`} aria-label="Hidden card"><span>◆</span></div>;
  }
  return (
    <div className={`card ${card.family} ${compact ? 'compact' : ''}`} aria-label={`${card.family} ${cardLabel(card)}`}>
      <span className="card-family">{card.family === 'blood' ? 'BLOOD' : 'SAND'}</span>
      <strong>{card.rank === 'impostor' ? 'I' : card.rank === 'sylop' ? 'S' : card.rank}</strong>
      <span className="card-name">{cardLabel(card)}</span>
    </div>
  );
}

function EmptyDiscardView({ family }: { family: CardFamily }) {
  return (
    <div className={`card ${family} compact empty-card`} aria-label={`Empty ${family} discard pile`}>
      <span className="card-family">{family === 'blood' ? 'BLOOD' : 'SAND'}</span>
      <strong>—</strong>
      <span className="card-name">EMPTY</span>
    </div>
  );
}

function ChipCount({ player }: { player: Player }) {
  return (
    <div className="chip-count" title={`${player.stock} in stock, ${player.pot} invested`}>
      <span className="chip-dot" /> {player.stock}
      {player.pot > 0 && <small>+{player.pot} at risk</small>}
    </div>
  );
}

function OpponentSeat({ player, reveal, active }: { player: Player; reveal: boolean; active: boolean }) {
  return (
    <section className={`opponent-seat ${active ? 'active-seat' : ''} ${player.eliminated ? 'eliminated' : ''}`}>
      <div className="seat-heading">
        <div>
          <strong>{player.name}</strong>
          <small>{player.personality}</small>
        </div>
        <ChipCount player={player} />
      </div>
      <div className="mini-hand">
        <CardView card={player.hand.blood} hidden={!reveal} compact />
        <CardView card={player.hand.sand} hidden={!reveal} compact />
      </div>
      {player.eliminated && <span className="eliminated-label">OUT</span>}
    </section>
  );
}

function ResultLine({ result, player }: { result: RoundResult; player: Player }) {
  return (
    <div className={`result-line ${result.winner ? 'winner' : ''}`}>
      <div>
        <strong>{player.name}</strong>
        <span>{result.hand.isPureSabacc ? 'Pure Sabacc' : result.hand.isSabacc ? `${result.hand.blood} Sabacc` : `Difference ${result.hand.difference}`}</span>
      </div>
      <div className="result-values">
        <span>{result.hand.blood} / {result.hand.sand}</span>
        <strong>{result.winner ? 'WINNER' : `−${result.penalty}`}</strong>
      </div>
    </div>
  );
}

function DiceOptions({
  values,
  selected,
  onSelect,
}: {
  values: [number, number];
  selected?: number;
  onSelect: (value: number) => void;
}) {
  const uniqueValues = [...new Set(values)];
  return (
    <div>
      {uniqueValues.map((value) => (
        <button
          className={selected === value ? 'selected' : ''}
          key={value}
          onClick={() => onSelect(value)}
        >
          {value}{uniqueValues.length === 1 ? ' ×2' : ''}
        </button>
      ))}
    </div>
  );
}

function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Core rules">
      <section className="modal rules-modal">
        <button className="close-button" onClick={onClose} aria-label="Close rules">×</button>
        <p className="eyebrow">CORE MODE</p>
        <h2>How this table plays</h2>
        <div className="rules-grid">
          <div><strong>Goal</strong><p>Finish with the best two-card hand. A matching Blood and Sand value is Sabacc; lower matched values beat higher ones. Two Sylops are unbeatable.</p></div>
          <div><strong>Your turn</strong><p>Stand for free, spend one token to inspect a hidden draw and keep or refuse it, or swap a visible discard directly for your same-family card.</p></div>
          <div><strong>Round end</strong><p>There are three turns, but the round ends immediately if everyone stands during the same turn.</p></div>
          <div><strong>Tokens</strong><p>Round winners recover only their own invested tokens. Other players’ invested and penalty tokens leave play; they are not awarded to the round winner.</p></div>
          <div><strong>Tiebreaks</strong><p>Lowest difference wins. Equal differences use the lower pair (implemented as the lower card sum). Exact ties create multiple winners.</p></div>
          <div><strong>Diagnostics</strong><p>After each round you can copy a local debug report containing the seed, full deal, AI state and table log. Nothing is transmitted automatically.</p></div>
        </div>
      </section>
    </div>
  );
}

function seedFromQuery(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? normalizeSeed(value) : undefined;
}

function SetupScreen({ onStart, onRules }: { onStart: (config: GameConfig) => void; onRules: () => void }) {
  const [opponents, setOpponents] = useState<1 | 2 | 3>(3);
  const [tokens, setTokens] = useState(5);
  const [difficulty, setDifficulty] = useState<GameConfig['difficulty']>('standard');
  const [replaySeed] = useState(seedFromQuery);

  return (
    <main className="setup-screen">
      <section className="hero-panel">
        <p className="eyebrow">A FAN-MADE BROWSER TABLE</p>
        <h1>KESSEL<br />SABACC</h1>
        <p className="hero-copy">A complete core-rules game against fair-information computer opponents with distinct risk personalities.</p>
        {replaySeed !== undefined && <p className="replay-seed">Replaying deterministic seed <strong>{replaySeed}</strong>.</p>}
        <div className="setup-controls">
          <label>
            Opponents
            <select value={opponents} onChange={(event) => setOpponents(Number(event.target.value) as 1 | 2 | 3)}>
              <option value={1}>1 opponent</option>
              <option value={2}>2 opponents</option>
              <option value={3}>3 opponents</option>
            </select>
          </label>
          <label>
            Starting tokens
            <input type="range" min="4" max="8" value={tokens} onChange={(event) => setTokens(Number(event.target.value))} />
            <span>{tokens}</span>
          </label>
          <label>
            AI difficulty
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as GameConfig['difficulty'])}>
              <option value="casual">Casual — more mistakes</option>
              <option value="standard">Standard — personality-led</option>
              <option value="expert">Expert — low-noise decisions</option>
            </select>
          </label>
        </div>
        <div className="setup-actions">
          <button className="primary-button" onClick={() => onStart({ opponentCount: opponents, startingTokens: tokens, difficulty, seed: replaySeed ?? normalizeSeed(Date.now()) })}>Take a seat</button>
          <button className="text-button" onClick={onRules}>Read core rules</button>
        </div>
      </section>
      <aside className="personality-panel">
        <p className="eyebrow">YOUR OPPONENTS</p>
        <div><strong>Vexa · Analyst</strong><span>Low-noise, probability-led draws.</span></div>
        <div><strong>Brakk · Gambler</strong><span>Spends freely and embraces Impostors.</span></div>
        <div><strong>Mira · Cautious</strong><span>Protects her stock and locks good hands.</span></div>
        <small>No opponent reads hidden hands or deck order.</small>
      </aside>
    </main>
  );
}

function GameTable({ state, setState, onExit, onRules }: {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState | null>>;
  onExit: () => void;
  onRules: () => void;
}) {
  const current = getCurrentPlayer(state);
  const human = state.players.find((player) => player.isHuman)!;
  const opponents = state.players.filter((player) => !player.isHuman);
  const reveal = ['resolution-choice', 'round-over', 'game-over'].includes(state.phase);
  const humanTurn = current.isHuman && state.phase === 'player-action';
  const [choices, setChoices] = useState<ImpostorChoices>({});
  const [debugStatus, setDebugStatus] = useState('');
  const [incidentReport, setIncidentReport] = useState<string | null>(null);
  const actionLock = useRef(false);

  useEffect(() => {
    if (state.phase !== 'resolution-choice') setChoices({});
  }, [state.phase, state.round]);

  const rolls = state.resolutionRolls[human.id] ?? {};
  const needsBlood = human.hand.blood.rank === 'impostor';
  const needsSand = human.hand.sand.rank === 'impostor';
  const choicesComplete = (!needsBlood || choices.blood !== undefined) && (!needsSand || choices.sand !== undefined);
  const bloodDiscard = getTopDiscard(state, 'blood');
  const sandDiscard = getTopDiscard(state, 'sand');

  const copyDebugReport = async () => {
    await copyDebugText(buildDebugReport(state, window.location.href));
    setDebugStatus('Copied');
    window.setTimeout(() => setDebugStatus(''), 1800);
  };

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
  };

  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="brand-button" onClick={onExit}>KESSEL SABACC</button>
        <div className="round-status"><span>ROUND {state.round}</span><strong>TURN {state.turn} / 3</strong></div>
        <div className="header-actions">
          <small className="build-id">{BUILD_ID}</small>
          <button className="text-button" onClick={copyDebugReport}>{debugStatus || 'Copy debug'}</button>
          <button className="text-button" onClick={onRules}>Rules</button>
        </div>
      </header>

      <section className="table-surface">
        <div className="opponents-row">
          {opponents.map((player) => <OpponentSeat key={player.id} player={player} reveal={reveal} active={current.id === player.id && state.phase === 'player-action'} />)}
        </div>

        <div className="center-table">
          <div className="pile-group">
            <button disabled={!humanTurn || human.stock <= 0 || state.piles.bloodDraw.length === 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'draw') : prev)} className="draw-stack blood-stack">
              <span>{state.piles.bloodDraw.length}</span><strong>BLOOD DRAW</strong>
            </button>
            <button disabled={!humanTurn || human.stock <= 0 || !bloodDiscard} onClick={() => performDiscardSwap('blood')} className="discard-button">
              {bloodDiscard ? <CardView card={bloodDiscard} compact /> : <EmptyDiscardView family="blood" />}<span>{bloodDiscard ? 'Swap discard · 1 token' : 'Discard empty'}</span>
            </button>
          </div>

          <div className="table-message">
            <span>{state.phase === 'player-action' ? `${current.name}'s action` : state.phase === 'resolution-choice' ? 'Resolution' : state.phase === 'round-over' ? 'Round complete' : 'Game complete'}</span>
            <strong>{state.phase === 'player-action' && !current.isHuman ? `${current.name} is thinking…` : humanTurn ? 'Choose an action' : state.phase === 'resolution-choice' ? 'Impostors roll' : ''}</strong>
          </div>

          <div className="pile-group">
            <button disabled={!humanTurn || human.stock <= 0 || !sandDiscard} onClick={() => performDiscardSwap('sand')} className="discard-button">
              {sandDiscard ? <CardView card={sandDiscard} compact /> : <EmptyDiscardView family="sand" />}<span>{sandDiscard ? 'Swap discard · 1 token' : 'Discard empty'}</span>
            </button>
            <button disabled={!humanTurn || human.stock <= 0 || state.piles.sandDraw.length === 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'draw') : prev)} className="draw-stack sand-stack">
              <span>{state.piles.sandDraw.length}</span><strong>SAND DRAW</strong>
            </button>
          </div>
        </div>

        <section className={`human-seat ${humanTurn ? 'active-seat' : ''} ${human.eliminated ? 'eliminated' : ''}`}>
          <div className="human-info"><div><p className="eyebrow">YOUR HAND</p><strong>{human.eliminated ? 'Eliminated' : humanTurn ? 'Your move' : 'Waiting'}</strong></div><ChipCount player={human} /></div>
          <div className="human-hand"><CardView card={human.hand.blood} /><CardView card={human.hand.sand} /></div>
          <div className="action-bar">
            <button className="stand-button" disabled={!humanTurn} onClick={() => setState((prev) => prev ? stand(prev) : prev)}>Stand</button>
            <span>Drawing costs 1 token. Click a deck or discard pile.</span>
          </div>
        </section>
      </section>

      <aside className="game-log">
        <p className="eyebrow">TABLE LOG</p>
        <div>{state.log.slice(-9).reverse().map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</div>
      </aside>

      {state.phase === 'draw-decision' && state.pendingDraw?.playerId === human.id && (
        <div className="overlay">
          <section className="modal draw-modal">
            <p className="eyebrow">DRAWN CARD</p>
            <h2>Keep it?</h2>
            <div className="compare-cards">
              <div><span>Current</span><CardView card={human.hand[state.pendingDraw.family]} /></div>
              <div><span>Drawn</span><CardView card={state.pendingDraw.card} /></div>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setState((prev) => prev ? finishDraw(prev, false) : prev)}>Refuse</button>
              <button className="primary-button" onClick={() => setState((prev) => prev ? finishDraw(prev, true) : prev)}>Keep card</button>
            </div>
          </section>
        </div>
      )}


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

      {state.phase === 'resolution-choice' && humanNeedsImpostorChoice(state) && (
        <div className="overlay">
          <section className="modal resolution-modal">
            <p className="eyebrow">IMPOSTOR RESOLUTION</p>
            <h2>Choose your dice value</h2>
            {needsBlood && rolls.blood && (
              <div className="dice-choice">
                <strong>Blood Impostor</strong>
                <DiceOptions values={rolls.blood} selected={choices.blood} onSelect={(value) => setChoices((currentChoices) => ({ ...currentChoices, blood: value }))} />
              </div>
            )}
            {needsSand && rolls.sand && (
              <div className="dice-choice">
                <strong>Sand Impostor</strong>
                <DiceOptions values={rolls.sand} selected={choices.sand} onSelect={(value) => setChoices((currentChoices) => ({ ...currentChoices, sand: value }))} />
              </div>
            )}
            <button className="primary-button" disabled={!choicesComplete} onClick={() => setState((prev) => prev ? finalizeResolution(prev, choices) : prev)}>Resolve hands</button>
          </section>
        </div>
      )}

      {state.phase === 'round-over' && (
        <div className="overlay">
          <section className="modal result-modal">
            <p className="eyebrow">ROUND {state.round} RESULTS</p>
            <h2>{state.results.filter((result) => result.winner).map((result) => state.players.find((player) => player.id === result.playerId)?.name).join(' & ')} won</h2>
            <div className="results-list">{state.results.map((result) => <ResultLine key={result.playerId} result={result} player={state.players.find((player) => player.id === result.playerId)!} />)}</div>
            <p className="debug-seed">Seed: <code>{state.config.seed ?? 'not recorded'}</code></p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={copyDebugReport}>Copy debug report</button>
              <button className="primary-button" onClick={() => setState((prev) => prev ? startNextRound(prev) : prev)}>Deal next round</button>
            </div>
            {debugStatus && <p className="debug-status">{debugStatus}</p>}
          </section>
        </div>
      )}

      {state.phase === 'game-over' && (
        <div className="overlay">
          <section className="modal result-modal game-over-modal">
            <p className="eyebrow">GAME OVER</p>
            <h2>{state.players.find((player) => player.id === state.winnerId)?.name} wins the table</h2>
            <div className="results-list">{state.results.map((result) => <ResultLine key={result.playerId} result={result} player={state.players.find((player) => player.id === result.playerId)!} />)}</div>
            <p className="debug-seed">Seed: <code>{state.config.seed ?? 'not recorded'}</code></p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={copyDebugReport}>Copy debug report</button>
              <button className="primary-button" onClick={onExit}>New game</button>
            </div>
            {debugStatus && <p className="debug-status">{debugStatus}</p>}
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (state) persistDebugState(state, window.location.href);
  }, [state]);

  useEffect(() => {
    if (!state || state.phase !== 'player-action') return;
    const current = getCurrentPlayer(state);
    if (current.isHuman) return;
    const timer = window.setTimeout(() => {
      setState((previous) => previous ? executeAiTurn(previous) : previous);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!state || state.phase !== 'resolution-choice' || humanNeedsImpostorChoice(state)) return;
    const timer = window.setTimeout(() => {
      setState((previous) => previous ? finalizeResolution(previous) : previous);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [state]);

  const page = useMemo(() => state
    ? <GameTable state={state} setState={setState} onExit={() => setState(null)} onRules={() => setShowRules(true)} />
    : <SetupScreen onStart={(config) => setState(createGame(config))} onRules={() => setShowRules(true)} />,
  [state]);

  return <>{page}{showRules && <RulesPanel onClose={() => setShowRules(false)} />}</>;
}
