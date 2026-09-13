import type { KelimeGame, KelimePlayer } from "./types";
import { BASLANGIC_KELIMELERI, TURKCE_KELIME_SET } from "./words";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

const games = new Map<string, KelimeGame>();

function randomStarter(): string {
  return (
    BASLANGIC_KELIMELERI[
      Math.floor(Math.random() * BASLANGIC_KELIMELERI.length)
    ] ?? "masa"
  );
}

export function getGame(channelId: string): KelimeGame | undefined {
  return games.get(channelId);
}

export function createGame(
  guildId: string,
  channelId: string,
  configuredBy: string,
): KelimeGame {
  const game: KelimeGame = {
    guildId,
    channelId,
    configuredBy,
    currentWord: randomStarter(),
    usedWords: new Set(),
    players: new Map(),
  };
  game.usedWords.add(game.currentWord);
  games.set(channelId, game);
  return game;
}

export function endGame(channelId: string): void {
  games.delete(channelId);
}

function normalizeWord(rawWord: string): string {
  return rawWord.trim().toLocaleLowerCase("tr-TR").normalize("NFC");
}

export type SubmitWordResult =
  | { ok: true; word: string; points: number; totalScore: number }
  | { ok: false; reason: string };

export function submitWord(
  channelId: string,
  userId: string,
  username: string,
  rawWord: string,
): SubmitWordResult {
  const game = games.get(channelId);
  if (!game) {
    return { ok: false, reason: "Bu kanalda aktif bir kelime oyunu yok." };
  }

  const word = normalizeWord(rawWord);
  const requiredLetter = game.currentWord.at(-1);

  if (!/^[a-zçğıöşü]+$/u.test(word)) {
    return {
      ok: false,
      reason: "Sadece Türkçe harflerden oluşan tek bir kelime yazabilirsin.",
    };
  }
  if (word.length < 3) {
    return { ok: false, reason: "Kelime en az 3 harfli olmalı." };
  }
  if (!TURKCE_KELIME_SET.has(word)) {
    return {
      ok: false,
      reason: `**${word}** kelime listesinde bulunamadı. Yalnızca Türkçe kelimeler kabul edilir.`,
    };
  }
  if (game.usedWords.has(word)) {
    return { ok: false, reason: "Bu kelime daha önce kullanıldı." };
  }
  if (requiredLetter && word[0] !== requiredLetter) {
    return {
      ok: false,
      reason: `Kelime **${requiredLetter.toLocaleUpperCase("tr-TR")}** harfiyle başlamalı.`,
    };
  }

  const points = word.length;
  const player: KelimePlayer = game.players.get(userId) ?? {
    userId,
    username,
    score: 0,
  };
  player.username = username;
  player.score += points;
  game.players.set(userId, player);
  game.currentWord = word;
  game.usedWords.add(word);

  return { ok: true, word, points, totalScore: player.score };
}

function scoreLines(game: KelimeGame): string {
  const players = [...game.players.values()].sort((a, b) => b.score - a.score);
  if (players.length === 0) return "Henüz puan alan yok.";

  const visiblePlayers = players.slice(0, 20);
  const lines = visiblePlayers.map(
    (player, index) =>
      `${index + 1}. <@${player.userId}> — **${player.score} puan**`,
  );
  if (players.length > visiblePlayers.length) {
    lines.push(`... ve **${players.length - visiblePlayers.length}** oyuncu daha.`);
  }
  return lines.join("\n");
}

export function buildGameEmbed(game: KelimeGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const requiredLetter = game.currentWord.at(-1)?.toLocaleUpperCase("tr-TR");
  const embed = new EmbedBuilder()
    .setTitle("🔤 Türkçe Kelime Türetme")
    .setColor(0x2ecc71)
    .setDescription(
      `Son kelime: **${game.currentWord}**\n\n` +
        `Sıradaki kelime **${requiredLetter}** harfiyle başlamalı.\n` +
        "Katılmak için butona basıp kelimeni gönder. Oyuncu sayısında sınır yoktur.",
    )
    .addFields(
      {
        name: `👥 Oyuncular (${game.players.size})`,
        value: "Bu kanaldaki herkes oynayabilir.",
      },
      { name: "🏆 Puan Durumu", value: scoreLines(game) },
      {
        name: "📖 Kurallar",
        value:
          "• Yalnızca Türkçe kelimeler\n" +
          "• Kelime son kelimenin son harfiyle başlamalı\n" +
          "• Aynı kelime tekrar kullanılamaz\n" +
          "• Kelime en az 3 harfli olmalı\n" +
          "• Her harf 1 puan",
      },
    )
    .setFooter({
      text: `Kullanılan kelime: ${game.usedWords.size} • Sınırsız oyuncu`,
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("kelime:write")
      .setLabel("Kelime Yaz")
      .setEmoji("✍️")
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}