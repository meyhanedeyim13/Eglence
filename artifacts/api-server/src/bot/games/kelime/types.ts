export type KelimePhase = "lobby" | "playing" | "finished";

export interface KelimePlayer {
  userId: string;
  username: string;
  score: number;
}

export interface KelimeGame {
  channelId: string;
  hostId: string;
  players: KelimePlayer[];
  phase: KelimePhase;
  currentPlayerIndex: number;
  currentWord: string;
  usedWords: Set<string>;
  winner?: string;
  lastMessageId?: string;
}