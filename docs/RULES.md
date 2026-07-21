# Encoded core rules

The implementation starts from the community rules compilation at:

- https://www.reddit.com/r/StarWarsSabacc/comments/1i0gy4t/kessel_sabacc_comprehensive_rules/

The comments contain important corrections and clarifications that are included here.

## Components

Each family—Blood and Sand—contains 22 cards:

- three each of values 1 through 6
- three Impostors
- one Sylop

A player holds exactly one card of each family.

## Setup and turn order

- Each active player receives one Blood and one Sand card.
- One card from each family starts its face-up discard pile.
- A round has at most three turns.
- Every active player gets one action per turn, clockwise from the round starter.
- The first round starter is random.
- Later starters rotate clockwise from the prior round starter, skipping eliminated players.
- If every active player stands during the same turn, the round ends immediately.

The rotating clockwise starter and all-stand early ending reflect corrections discussed in the source thread.

## Actions

Standing costs nothing.

Drawing costs one token, moved from the player's stock to their at-risk pot. A player may draw from either family's:

- face-down draw pile
- face-up discard pile

After seeing the card, the player accepts it or refuses it.

- Accept: the drawn card enters the hand; the replaced hand card goes face-up to its discard pile.
- Refuse: the drawn card goes face-up to its discard pile; the hand is unchanged.
- A player with no stock remaining must stand.

## Special cards

Resolution follows the source order:

1. Two Sylops become a Pure Sabacc hand of 0 / 0.
2. Each Impostor rolls two six-sided dice and its player chooses one result.
3. A single Sylop copies the resolved value of the other card.

The human chooses Impostor dice in the UI. Computer players choose the combination that produces their strongest legal hand.

## Ranking

There is always at least one round winner.

1. Pure Sabacc beats every other hand.
2. Any Sabacc hand beats any non-Sabacc hand.
3. Among Sabacc hands, the lower matched value wins.
4. Among non-Sabacc hands, the lower absolute difference wins.
5. Equal differences are broken by the lower pair. The engine compares card sums, which is equivalent when the differences are equal.
6. Exact ties produce multiple winners.

The explicit guaranteed-winner and lower-pair tiebreak came from a noteworthy correction in the comments.

## Token resolution and elimination

- Winners recover all tokens they invested during the round.
- A losing Sabacc hand pays one additional token.
- A losing non-Sabacc hand pays tokens equal to its card difference.
- Invested pots are cleared after resolution.
- A player whose stock is zero or lower is eliminated.
- The last remaining player wins the game.

## Intentionally deferred

- shift tokens
- cheating actions
- multiplayer networking
- alternate Sabacc variants

Shift tokens can alter core action legality and scoring, so they should enter through explicit effect hooks and tests rather than ad-hoc conditionals in the base rules.
