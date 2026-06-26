import type { UnoCard, UnoColor, UnoCardColor, UnoCardValue } from "./types";

const COLORS: UnoColor[] = ["red", "green", "blue", "yellow"];
const NUMBER_VALUES: UnoCardValue[] = ["0","1","2","3","4","5","6","7","8","9"];
const ACTION_VALUES: UnoCardValue[] = ["skip", "reverse", "draw2"];

let cardIdCounter = 0;

function makeCard(color: UnoCardColor, value: UnoCardValue): UnoCard {
  return { color, value, id: cardIdCounter++ };
}

export function createShuffledDeck(): UnoCard[] {
  const cards: UnoCard[] = [];

  for (const color of COLORS) {
    cards.push(makeCard(color, "0"));
    for (const value of NUMBER_VALUES.slice(1)) {
      cards.push(makeCard(color, value));
      cards.push(makeCard(color, value));
    }
    for (const value of ACTION_VALUES) {
      cards.push(makeCard(color, value));
      cards.push(makeCard(color, value));
    }
  }

  for (let i = 0; i < 4; i++) {
    cards.push(makeCard("wild", "wild"));
    cards.push(makeCard("wild", "wilddraw4"));
  }

  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

export const COLOR_EMOJI: Record<string, string> = {
  red: "🔴", green: "🟢", blue: "🔵", yellow: "🟡", wild: "⚫",
};

const VALUE_LABEL: Record<string, string> = {
  skip: "Skip", reverse: "Reverse", draw2: "+2", wild: "Wild", wilddraw4: "Wild+4",
};

export function cardLabel(card: UnoCard): string {
  const color = COLOR_EMOJI[card.color] ?? "⚫";
  const value = VALUE_LABEL[card.value] ?? card.value;
  return `${color} ${value}`;
}

export function canPlay(card: UnoCard, topCard: UnoCard, currentColor: string): boolean {
  if (card.color === "wild") return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}
