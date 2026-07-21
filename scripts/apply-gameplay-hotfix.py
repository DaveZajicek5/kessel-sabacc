from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


# Engine: visible discard draws are committed atomically.
path = Path("src/game/engine.ts")
text = path.read_text()
text = replace_once(
    text,
    "  const piles = updatePile(state.piles, family, source, selected.rest);",
    """  // Hidden draws are removed immediately. Visible discards stay on the table
  // until Keep/Refuse is resolved, so the move is committed atomically.
  const piles = source === 'draw'
    ? updatePile(state.piles, family, source, selected.rest)
    : state.piles;""",
    "beginDraw pile update",
)
finish_start = text.index("export function finishDraw")
keep_at = text.index("  if (keep) {", finish_start)
transaction = """  // Remove a visible discard only when the player actually keeps it.
  // Refusing it leaves the pile unchanged.
  if (pending.source === 'discard' && keep) {
    const key = `${pending.family}Discard` as keyof Piles;
    const top = drawTop(piles[key]);
    if (top.card.id !== pending.card.id) {
      throw new Error('Visible discard changed before the draw was resolved');
    }
    piles = updatePile(piles, pending.family, 'discard', top.rest);
  }

"""
text = text[:keep_at] + transaction + text[keep_at:]
text = replace_once(
    text,
    """  } else {
    piles = addToDiscard(piles, pending.card);
    detail = `${player.name} refuses the card; ${cardLabel(pending.card)} is now visible.`;
  }""",
    """  } else {
    if (pending.source === 'draw') {
      piles = addToDiscard(piles, pending.card);
      detail = `${player.name} refuses the hidden card; ${cardLabel(pending.card)} is now visible.`;
    } else {
      detail = `${player.name} leaves the visible ${cardLabel(pending.card)} on the discard pile.`;
    }
  }""",
    "finishDraw refusal",
)
text, count = re.subn(
    r"export function getTopDiscard\(state: GameState, family: CardFamily\): Card \{.*?\n\}",
    """export function getTopDiscard(state: GameState, family: CardFamily): Card | undefined {
  const pile = state.piles[`${family}Discard` as keyof Piles];
  return pile[pile.length - 1];
}""",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("could not replace getTopDiscard")
path.write_text(text)


# AI: never select a pile that has no card.
path = Path("src/game/ai.ts")
text = path.read_text()
random_start = text.index("function randomLegalDecision")
options_start = text.index("  const options: AiDecision[] = [", random_start)
options_end = text.index("  const roll = randomInt", options_start)
text = text[:options_start] + """  const options: AiDecision[] = [
    { kind: 'stand', explanation: 'A deliberately unpredictable stand.' },
  ];
  if (state.piles.bloodDraw.length > 0) options.push({ kind: 'draw', family: 'blood', source: 'draw', explanation: 'A chaotic draw.' });
  if (state.piles.sandDraw.length > 0) options.push({ kind: 'draw', family: 'sand', source: 'draw', explanation: 'A chaotic draw.' });
  if (state.piles.bloodDiscard.length > 0) options.push({ kind: 'draw', family: 'blood', source: 'discard', explanation: 'A chaotic grab.' });
  if (state.piles.sandDiscard.length > 0) options.push({ kind: 'draw', family: 'sand', source: 'discard', explanation: 'A chaotic grab.' });
""" + text[options_end:]
choice_start = text.index("export function chooseAiDecision")
loop_start = text.index("  for (const family of ['blood', 'sand'] as const) {", choice_start)
loop_end = text.index("\n\n  const currentStrength", loop_start)
text = text[:loop_start] + """  for (const family of ['blood', 'sand'] as const) {
    const discard = getTopDiscard(state, family);
    if (discard) {
      const known = knownImprovement(player, family, discard, profile);
      const knownNoise = nextRandom(randomState);
      randomState = knownNoise.state;
      candidates.push({
        decision: {
          kind: 'draw',
          family,
          source: 'discard',
          explanation: known > 12 ? 'The visible card creates a major improvement.' : 'The visible card is worth the token risk.',
        },
        score: known + profile.exploration - cost + (knownNoise.value - 0.5) * profile.noise * difficulty.noise,
      });
    }

    if (state.piles[`${family}Draw`].length > 0) {
      const expected = expectedDrawImprovement(state, player, family, profile);
      const drawNoise = nextRandom(randomState);
      randomState = drawNoise.state;
      candidates.push({
        decision: {
          kind: 'draw',
          family,
          source: 'draw',
          explanation: 'The unknown-card odds justify a draw.',
        },
        score: expected + profile.exploration - cost + (drawNoise.value - 0.5) * profile.noise * difficulty.noise,
      });
    }
  }""" + text[loop_end:]
path.write_text(text)


# UI: render empty piles safely, clarify token flow and collapse doubles.
path = Path("src/App.tsx")
text = path.read_text()
text = replace_once(text, "  Card,\n  GameConfig,", "  Card,\n  CardFamily,\n  GameConfig,", "CardFamily import")
chip_at = text.index("function ChipCount")
empty_view = """function EmptyDiscardView({ family }: { family: CardFamily }) {
  return (
    <div className={`card ${family} compact empty-card`} aria-label={`Empty ${family} discard pile`}>
      <span className="card-family">{family === 'blood' ? 'BLOOD' : 'SAND'}</span>
      <strong>—</strong>
      <span className="card-name">EMPTY</span>
    </div>
  );
}

"""
text = text[:chip_at] + empty_view + text[chip_at:]
rules_at = text.index("function RulesPanel")
dice_options = """function DiceOptions({
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

"""
text = text[:rules_at] + dice_options + text[rules_at:]
text = replace_once(
    text,
    "<div><strong>Losses</strong><p>Winners recover invested tokens. Other Sabacc hands lose one extra token; non-Sabacc hands lose tokens equal to their card difference.</p></div>",
    "<div><strong>Tokens</strong><p>Round winners recover only their own invested tokens. Other players’ invested and penalty tokens leave play; they are not awarded to the round winner.</p></div>",
    "token rules text",
)
text = replace_once(
    text,
    "  const choicesComplete = (!needsBlood || choices.blood !== undefined) && (!needsSand || choices.sand !== undefined);",
    """  const choicesComplete = (!needsBlood || choices.blood !== undefined) && (!needsSand || choices.sand !== undefined);
  const bloodDiscard = getTopDiscard(state, 'blood');
  const sandDiscard = getTopDiscard(state, 'sand');""",
    "discard variables",
)
text = replace_once(
    text,
    "<button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'draw') : prev)} className=\"draw-stack blood-stack\">",
    "<button disabled={!humanTurn || human.stock <= 0 || state.piles.bloodDraw.length === 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'draw') : prev)} className=\"draw-stack blood-stack\">",
    "blood draw button",
)
text = replace_once(
    text,
    """<button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'discard') : prev)} className="discard-button">
              <CardView card={getTopDiscard(state, 'blood')} compact /><span>Take discard</span>
            </button>""",
    """<button disabled={!humanTurn || human.stock <= 0 || !bloodDiscard} onClick={() => setState((prev) => prev ? beginDraw(prev, 'blood', 'discard') : prev)} className="discard-button">
              {bloodDiscard ? <CardView card={bloodDiscard} compact /> : <EmptyDiscardView family="blood" />}<span>{bloodDiscard ? 'Take discard' : 'Discard empty'}</span>
            </button>""",
    "blood discard button",
)
text = replace_once(
    text,
    """<button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'discard') : prev)} className="discard-button">
              <CardView card={getTopDiscard(state, 'sand')} compact /><span>Take discard</span>
            </button>
            <button disabled={!humanTurn || human.stock <= 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'draw') : prev)} className="draw-stack sand-stack">""",
    """<button disabled={!humanTurn || human.stock <= 0 || !sandDiscard} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'discard') : prev)} className="discard-button">
              {sandDiscard ? <CardView card={sandDiscard} compact /> : <EmptyDiscardView family="sand" />}<span>{sandDiscard ? 'Take discard' : 'Discard empty'}</span>
            </button>
            <button disabled={!humanTurn || human.stock <= 0 || state.piles.sandDraw.length === 0} onClick={() => setState((prev) => prev ? beginDraw(prev, 'sand', 'draw') : prev)} className="draw-stack sand-stack">""",
    "sand pile buttons",
)
blood_choice = text.index("            {needsBlood && rolls.blood && (")
resolve_button = text.index("            <button className=\"primary-button\" disabled={!choicesComplete}", blood_choice)
new_choices = """            {needsBlood && rolls.blood && (
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
"""
text = text[:blood_choice] + new_choices + text[resolve_button:]
path.write_text(text)


# Regression coverage for a singleton discard and last-token draw.
path = Path("src/game/__tests__/engine.test.ts")
text = path.read_text()
start = text.index("  it('allows taking a singleton discard with the last token without crashing'")
end = text.index("\n\n});", start)
replacement = """  it('keeps a singleton discard visible while spending the last token', () => {
    const created = createGame({ opponentCount: 1, startingTokens: 1, difficulty: 'standard', seed: 3 });
    const initial = { ...created, startingSeat: 0, currentPlayerId: 'human' };
    const visible = getTopDiscard(initial, 'blood')!;

    const drawing = beginDraw(initial, 'blood', 'discard');
    const humanDuringDraw = drawing.players.find((player) => player.id === 'human')!;
    expect(drawing.phase).toBe('draw-decision');
    expect(humanDuringDraw.stock).toBe(0);
    expect(drawing.piles.bloodDiscard).toHaveLength(1);
    expect(getTopDiscard(drawing, 'blood')).toEqual(visible);
    expect(drawing.pendingDraw?.card).toEqual(visible);

    const after = finishDraw(drawing, true);
    expect(after.piles.bloodDiscard).toHaveLength(1);
    expect(getTopDiscard(after, 'blood')?.id).not.toBe(visible.id);
  });

  it('leaves a visible discard unchanged when it is refused', () => {
    const created = createGame({ opponentCount: 1, startingTokens: 2, difficulty: 'standard', seed: 4 });
    const initial = { ...created, startingSeat: 0, currentPlayerId: 'human' };
    const visible = getTopDiscard(initial, 'sand')!;

    const drawing = beginDraw(initial, 'sand', 'discard');
    const after = finishDraw(drawing, false);

    expect(after.piles.sandDiscard).toHaveLength(1);
    expect(getTopDiscard(after, 'sand')).toEqual(visible);
  });"""
text = text[:start] + replacement + text[end:]
path.write_text(text)
