export type UnoColor = "red" | "green" | "blue" | "yellow";
export type UnoCardColor = UnoColor | "wild";

export type UnoCardValue =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "skip" | "reverse" | "draw2"
  | "wild" | "wilddraw4";

export interface UnoCard {
  color: UnoCardColor;
  value: UnoCardValue;
  id: number;
}

export interface UnoPlayer {
  userId: string;
  username: string;
  hand: UnoCard[];
  calledUno: boolean;
}

export type UnoPhase = "lobby" | "playing" | "choosingColor" | "finished";

export interface UnoGame {
  channelId: string;
  hostId: string;
  players: UnoPlayer[];
  deck: UnoCard[];
  discardPile: UnoCard[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: UnoPhase;
  pendingDraw: number;
  currentColor: UnoColor;
  winner?: string;
  lastMessageId?: string;
}
