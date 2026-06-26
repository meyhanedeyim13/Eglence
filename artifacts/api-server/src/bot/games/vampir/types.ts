export type VampirRole = "köylü" | "vampir" | "doktor" | "kahin";
export type GamePhase = "lobby" | "night" | "day" | "voting" | "finished";

export interface VampirPlayer {
  userId: string;
  username: string;
  role: VampirRole;
  alive: boolean;
  protected: boolean;
}

export interface NightActions {
  vampirTarget?: string;
  doktorTarget?: string;
  kahinTarget?: string;
  actedUserIds: Set<string>;
}

export interface VampirGame {
  channelId: string;
  hostId: string;
  players: VampirPlayer[];
  phase: GamePhase;
  nightActions: NightActions;
  dayKilled?: string;
  nightKilled?: string;
  votes: Map<string, string>;
  roundNumber: number;
  lastMessageId?: string;
}
