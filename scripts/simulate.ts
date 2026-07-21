import { playAiGame } from '../src/game/simulator';
import type { AiPersonality } from '../src/game/types';

const gamesArgIndex = process.argv.findIndex((arg) => arg === '--games');
const games = gamesArgIndex >= 0 ? Number(process.argv[gamesArgIndex + 1]) : 1_000;
if (!Number.isInteger(games) || games <= 0) {
  throw new Error('Use --games followed by a positive integer.');
}

const wins: Record<AiPersonality, number> = {
  cautious: 0,
  balanced: 0,
  gambler: 0,
  analyst: 0,
  chaos: 0,
};
let totalRounds = 0;

for (let game = 0; game < games; game += 1) {
  const result = playAiGame({
    opponentCount: 3,
    startingTokens: 5,
    difficulty: 'expert',
    seed: game + 1,
  });
  wins[result.winnerPersonality] += 1;
  totalRounds += result.rounds;
}

console.log(`Simulated ${games.toLocaleString()} games`);
console.log(`Average rounds: ${(totalRounds / games).toFixed(2)}`);
for (const [personality, count] of Object.entries(wins)) {
  console.log(`${personality.padEnd(9)} ${(count / games * 100).toFixed(1)}% (${count})`);
}
