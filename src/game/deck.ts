import type { Card, CardFamily, CardRank } from './types';
import { shuffleWithState } from './random';

const numberedRanks: CardRank[] = [1, 2, 3, 4, 5, 6];

export function createFamilyDeck(family: CardFamily): Card[] {
  const cards: Card[] = [];
  for (const rank of numberedRanks) {
    for (let copy = 0; copy < 3; copy += 1) {
      cards.push({ id: `${family}-${rank}-${copy}`, family, rank });
    }
  }
  for (let copy = 0; copy < 3; copy += 1) {
    cards.push({ id: `${family}-impostor-${copy}`, family, rank: 'impostor' });
  }
  cards.push({ id: `${family}-sylop-0`, family, rank: 'sylop' });
  return cards;
}

export function shuffledFamilyDeck(family: CardFamily, state: number): { cards: Card[]; state: number } {
  const shuffled = shuffleWithState(createFamilyDeck(family), state);
  return { cards: shuffled.value, state: shuffled.state };
}

export function cardLabel(card: Card): string {
  if (card.rank === 'impostor') return 'Impostor';
  if (card.rank === 'sylop') return 'Sylop';
  return String(card.rank);
}
