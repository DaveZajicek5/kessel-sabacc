import { useEffect, useMemo, useState } from 'react';
import { executeAiTurn } from './game/ai';
import { cardLabel } from './game/deck';
import {
  beginDraw,
  createGame,
  finalizeResolution,
  finishDraw,
  getCurrentPlayer,
  getTopDiscard,
  humanNeedsImpostorChoice,
  stand,
  startNextRound,
} from './game/engine';
import type {
  Card,
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

function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Core rules">
      <section className="modal rules-modal">
        <button className="close-button" onClick={onClose} aria-label="Close rules">×</button>
        <p className="eyebrow">CORE MODE</p>
        <h2>How this table plays</h2>
        <div className="rules-grid">
          <div><strong>Goal</strong><p>Finish with the best two-card hand. A matching Blood and Sand value is Sabacc; lower matched values beat higher ones. Two Sylops are unbeatable.</p></div>
          <div><strong>Your turn</strong><p>Stand for free, or spend one token to draw from either family’s hidden draw pile or visible discard pile. Then keep or refuse the card.</p></div>
          <div><strong>Round end</strong><p>There are three turns, but the round ends immediately if everyone stands during the same turn.</p></div>
          <div><strong>Losses</strong><p>Winners recover invested tokens. Other Sabacc hands lose one extra token; non-Sabacc hands lose tokens equal to their card difference.</p></div>
          <div><strong>Tiebreaks</strong><p>Lowest difference wins. Equal differences use the lower pair (implemented as the lower card sum). Exact ties create multiple winners.</p></div>
          <div><strong>Current scope</strong><p>Shift tokens and cheating mechanics are intentionally excluded from this first rules-complete core.</p></div>
        </div>
      </section>
    </div>
  );
}

function SetupScreen({ onStart, onRules }: { onStart: (config: GameConfig) => void; onRules: () => void }) {
  const [opponents, setOpponents] = useState<1 | 2 | 3>(3);
  const [tokens, setTokens] = useState(5);
  const [difficulty, setDifficulty] = useState<GameConfig['difficulty']>('standard');

  return (
    <main className="setup-screen">
      <section className="hero-panel">
        <p className="eyebrow">A FAN-MADE BROWSER TABLE</p>
        <h1>KESSEL<br />SABACC</h1>
        <p className="hero-copy">A complete core-rules game against fair-information computer opponents with distinct risk personalities.</p>
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
          <button className="primary-button" onClick={() => onStart({ opponentCount: opponents, startingTokens: tokens, difficulty })}>Take a seat</button>
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

  useEffect(() => {
    if (state.phase !== 'resolution-choice') setChoices({});
  }, [state.phase, state.round]);

  const rolls = state.resolutionRolls[human.id] ?? {};
  const needsBlood = human.hand.blood.rank === 'impostor';
  const needsSand = human.hand.sand.rank === 'impostor';
  const choicesComplete = (!needsBlood || choices.blood !== undefined) && (!needsSand || choices.sand !== undefined);

  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="brand-button" onClick={onExit}>KESSEL SABACC</button>
        <div className="round-status"><span>ROUND {state.round}</span><strong>TURN {state.turn} / 3</strong></div>
        <button className="text-button" onClick={onRules}>Rules</button>
      </header>

      <section className="table-surface">
        <div className="opponents-row">
          {opponents.map((player) => <OpponentSeat key={player.id} player={player} reveal={reveal} active={current.id === player.id && state.phase === 'player-action'} />)}
        </div>

        <div className="center-table">
          <div className="pile-group">
            <button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'draw') : prev)} className="draw-stack blood-stack">
              <span>{state.piles.bloodDraw.length}</span><strong>BLOOD DRAW</strong>
            </button>
            <button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'discard') : prev)} className="discard-button">
              <CardView card={getTopDiscard(state, 'blood')} compact /><span>Take discard</span>
            </button>
          </div>

          <div className="table-message">
            <span>{state.phase === 'player-action' ? `${current.name}'s action` : state.phase === 'resolution-choice' ? 'Resolution' : state.phase === 'round-over' ? 'Round complete' : 'Game complete'}</span>
            <strong>{state.phase === 'player-action' && !current.isHuman ? `${current.name} is thinking…` : humanTurn ? 'Choose an action' : state.phase === 'resolution-choice' ? 'Impostors roll' : ''}</strong>
          </div>

          <div className="pile-group">
            <button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'discard') : prev)} className="discard-button">
              <CardView card={getTopDiscard(state, 'sand')} compact /><span>Take discard</span>
            </button>
            <button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'draw') : prev)} className="draw-stack sand-stack">
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

      {state.phase === 'resolution-choice' && humanNeedsImpostorChoice(state) && (
        <div className="overlay">
          <section className="modal resolution-modal">
            <p className="eyebrow">IMPOSTOR RESOLUTION</p>
            <h2>Choose your dice value</h2>
            {needsBlood && rolls.blood && (
              <div className="dice-choice"><strong>Blood Impostor</strong><div>{rolls.blood.map((value) => <button className={choices.blood === value ? 'selected' : ''} key={value} onClick={() => setChoices((currentChoices) => ({ ...currentChoices, blood: value }))}>{value}</button>)}</div></div>
            )}
            {needsSand && rolls.sand && (
              <div className="dice-choice"><strong>Sand Impostor</strong><div>{rolls.sand.map((value) => <button className={choices.sand === value ? 'selected' : ''} key={value} onClick={() => setChoices((currentChoices) => ({ ...currentChoices, sand: value }))}>{value}</button>)}</div></div>
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
            <button className="primary-button" onClick={() => setState((prev) => prev ? startNextRound(prev) : prev)}>Deal next round</button>
          </section>
        </div>
      )}

      {state.phase === 'game-over' && (
        <div className="overlay">
          <section className="modal result-modal game-over-modal">
            <p className="eyebrow">GAME OVER</p>
            <h2>{state.players.find((player) => player.id === state.winnerId)?.name} wins the table</h2>
            <div className="results-list">{state.results.map((result) => <ResultLine key={result.playerId} result={result} player={state.players.find((player) => player.id === result.playerId)!} />)}</div>
            <button className="primary-button" onClick={onExit}>New game</button>
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
