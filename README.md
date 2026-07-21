# Kessel Sabacc

A fan-made, browser-playable implementation of the core Kessel Sabacc rules, with fair-information computer opponents and a headless self-play simulator for balancing them.

> This is an unofficial fan project and is not affiliated with or endorsed by Lucasfilm, Disney, Ubisoft, or the owners of the Star Wars intellectual property. The repository contains no extracted game assets.

## What is playable

- 2–4 players: one human and one to three computer opponents
- Separate 22-card Blood and Sand decks
- Three turns per round, with early resolution when every player stands in the same turn
- Draw or discard-pile actions, token costs, accepting/refusing cards, and visible discard movement
- Sylop and Impostor resolution
- Complete round ranking and tiebreaks, including multiple tied winners
- Token penalties, elimination, rotating starting player, and game victory
- Casual, Standard, and Expert AI difficulty
- Three distinct opponent personalities

Shift tokens and cheating mechanics are deliberately outside the first core mode. Their effects should be added as an extension layer rather than entangled with the base engine.

## Run locally

```bash
npm install
npm run dev
```

Production checks:

```bash
npm test
npm run build
```

## AI balancing

Run deterministic AI-only matches through the same engine used by the UI:

```bash
npm run simulate -- --games 5000
```

The initial 5,000-game expert baseline with five starting tokens produced:

| Personality | Win rate |
|---|---:|
| Analyst | 26.8% |
| Cautious | 26.6% |
| Balanced | 23.7% |
| Gambler | 22.9% |

Average game length was 4.2 rounds. These numbers are not a claim of optimal balance; they are a reproducible starting point for tuning.

See [docs/AI.md](docs/AI.md) for the opponent architecture and [docs/RULES.md](docs/RULES.md) for the encoded rules and source notes.

## Deployment

The included GitHub Pages workflow tests and builds the app on pushes to `main`, then publishes `dist/`. In repository settings, set **Pages → Source** to **GitHub Actions** if it is not already selected.

## Project structure

```text
src/game/            Pure rules engine, scoring, AI policies, deterministic RNG
src/App.tsx          Browser table and interaction flow
scripts/simulate.ts  Headless self-play entrypoint
docs/                Rule decisions and AI design notes
```

## Design principle

The game engine does not know about React. UI actions, computer actions, tests, and simulations all call the same pure state-transition functions. This keeps future shift-token, multiplayer, replay, and stronger-AI work testable.

## License

Code is available under the MIT License. Names and concepts belonging to their respective rights holders are not licensed by this repository.
