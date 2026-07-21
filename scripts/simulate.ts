import { playAiGame } from '../src/game/simulator';
import type { AiDifficulty, AiPersonality } from '../src/game/types';

const valueAfter = (name: string): string | undefined => {
  const index = process.argv.findIndex((arg) => arg === name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const games = Number(valueAfter('--games') ?? '1000');
const difficulty = (valueAfter('--difficulty') ?? 'expert') as AiDifficulty;
if (!Number.isInteger(games) || games <= 0) {
  throw new Error('Use --games followed by a positive integer.');
}
if (!['casual', 'standard', 'expert'].includes(difficulty)) {
  throw new Error('Use --difficulty casual, standard, or expert.');
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
    difficulty,
    seed: game + 1,
  });
  wins[result.winnerPersonality] += 1;
  totalRounds += result.rounds;
}

console.log(`FULL GAME AUDIT`);
console.log(`games=${games} difficulty=${difficulty} seeds=1..${games}`);
console.log(`Average rounds: ${(totalRounds / games).toFixed(2)}`);
for (const [personality, count] of Object.entries(wins)) {
  console.log(`${personality.padEnd(9)} ${(count / games * 100).toFixed(2)}% (${count})`);
}
