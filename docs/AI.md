# Enemy AI design

## MVP choice: heuristic policies, not machine learning

Kessel Sabacc has a small action space, hidden information, explicit token costs, and short games. A transparent heuristic policy is the fastest way to produce opponents that are understandable, debuggable, and tunable.

The AI never receives:

- opponent hand values
- hidden draw-pile order
- future dice rolls

It receives only its own hand, public discard history, stock/pot counts, and turn state. It estimates unknown draws from the remaining plausible family-card distribution.

## Decision process

For each legal draw source, the policy estimates:

1. current hand strength
2. known improvement from the visible discard, or expected improvement from an unknown draw
3. the option to refuse a revealed draw
4. token opportunity cost, increased when stock is low and the round is late
5. a small personality-specific exploration and noise term

Standing competes against those draw utilities. Strong Sabacc-quality hands receive a large stand bonus. Obvious moves—such as taking the second visible Sylop to create Pure Sabacc—emerge deterministically from the hand evaluator.

After drawing, the policy separately compares keeping the card with retaining its current family card. This mirrors the actual two-stage player experience without letting the AI inspect anything before paying.

## Personalities

- **Analyst:** low decision noise, moderate token cost, slight Impostor aversion
- **Cautious:** high token cost and strong stock preservation
- **Gambler:** low token cost, higher exploration, positive Impostor preference
- **Balanced:** middle-of-the-road baseline policy
- **Chaos:** uniformly random legal decisions; available in the engine for experiments, not currently seated in the UI

Difficulty changes mistake/noise rates, not access to hidden information.

## Self-play tuning loop

`scripts/simulate.ts` runs seeded AI-only games through the production engine. Use it to evaluate:

- win rate by personality
- average rounds per game
- elimination order
- tokens spent per round
- action-source frequencies
- stand rate by hand strength
- regret: how often a chosen action was worse than the best heuristic action

The current script reports the first two metrics. The engine state and log already expose enough information to add the others without changing gameplay.

Recommended tuning workflow:

1. Run at least 10,000 games for a baseline.
2. Change only one profile parameter at a time.
3. Re-run the same seed range for paired comparison.
4. Reject policies that win by becoming repetitive or implausibly risk-averse.
5. Play human test sessions and record whether losses feel legible and deserved.

Win-rate equality is not the only target. Enjoyable enemies should exhibit recognizable habits, make occasional recoverable mistakes, and create different token-pressure stories.

## Next AI tier

Before reinforcement learning, add a stronger search policy:

- sample hidden card allocations consistent with public information
- simulate the remaining turns with opponent policy models
- choose actions by expected survival/win utility
- cap rollouts by difficulty

This information-set Monte Carlo approach is a natural expert/boss tier. It remains explainable and can share the existing policy interface. Machine learning becomes useful later for learning value estimates or opponent models from simulation telemetry, not for replacing a rules-correct baseline.

## Boss and cheating design

The Reddit discussion suggested giving strong enemies extra knowledge or cheating actions. Prefer explicit, disclosed character abilities over silently letting an AI peek. A boss could have one limited-use power—peek at a draw, alter a die, swap a discard—implemented as a normal rule effect. That creates flavor without making ordinary opponents feel unfair.
