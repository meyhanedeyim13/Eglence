export interface KelimePlayer {
  userId: string;
  username: string;
  score: number;
}

export interface KelimeGame {
  guildId: string;
  channelId: string;
  configuredBy: string;
  currentWord: string;
  usedWords: Set<string>;
  players: Map<string, KelimePlayer>;
  lastMessageId?: string;
}