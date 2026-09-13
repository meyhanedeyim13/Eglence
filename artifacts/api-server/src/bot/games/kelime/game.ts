import type { KelimeGame, KelimePlayer } from "./types";
import { BASLANGIC_KELIMELERI, TURKCE_KELIME_SET } from "./words";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

const games = new Map<string, KelimeGame>();
const MAX_PLAYERS = 10;
const TARGET_SCORE = 30;

export function getGame(channelId: string): KelimeGame | undefined {
  return games.get(channelId);
}

export function createGame(
  channelId: string,
  hostId: string,
  hostUsername: string,
): KelimeGame {
  const game: KelimeGame = {
    channelId,
    hostId,
    players: [{ userId: hostId, username: hostUsername, score: 0 }],
    phase: "lobby",
    currentPlayerIndex: 0,
    currentWord: "",
    usedWords: new Set(),
  };
  games.set(channelId, game);
  return game;
}

export function joinGame(
  channelId: string,
  userId: string,
  username: string,
): "ok" | "no_game" | "already" | "full" | "started" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.phase !== "lobby") return "started";
  if (game.players.some((player) => player.userId === userId)) return "already";
  if (game.players.length >= MAX_PLAYERS) return "full";

  game.players.push({ userId, username, score: 0 });
  return "ok";
}

export function startGame(
  channelId: string,
  userId: string,
): "ok" | "no_game" | "not_host" | "too_few" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.hostId !== userId) return "not_host";
  if (game.players.length < 2) return "too_few";

  const starter =
    BASLANGIC_KELIMELERI[
      Math.floor(Math.random() * BASLANGIC_KELIMELERI.length)
    ] ?? "masa";

  game.currentWord = starter;
  game.usedWords = new Set([starter]);
  game.currentPlayerIndex = 0;
  game.phase = "playing";
  return "ok";
}

export function currentPlayer(game: KelimeGame): KelimePlayer {
  return game.players[game.currentPlayerIndex]!;
}

function normalizeWord(rawWord: string): string {
  return rawWord.trim().toLocaleLowerCase("tr-TR").normalize("NFC");
}

export type SubmitWordResult =
  | {
      ok: true;
      word: string;
      points: number;
      nextPlayer?: string;
      winner?: string;
    }
  | { ok: false; reason: string };

export function submitWord(
  channelId: string,
  userId: string,
  rawWord: string,
): SubmitWordResult {
  const game = games.get(channelId);
  if (!game || game.phase !== "playing") {
    return { ok: false, reason: "Bu kanalda aktif bir kelime oyunu yok." };
  }

  const player = currentPlayer(game);
  if (player.userId !== userId) {
    return {
      ok: false,
      reason: `Şu an sıra **${player.username}** kullanıcısında.`,
    };
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
  player.score += points;
  game.currentWord = word;
  game.usedWords.add(word);

  if (player.score >= TARGET_SCORE) {
    game.phase = "finished";
    game.winner = player.userId;
    return { ok: true, word, points, winner: player.userId };
  }

  game.currentPlayerIndex =
    (game.currentPlayerIndex + 1) % game.players.length;

  return {
    ok: true,
    word,
    points,
    nextPlayer: currentPlayer(game).username,
  };
}

export function endGame(channelId: string): void {
  games.delete(channelId);
}

function scoreLines(game: KelimeGame): string {
  return [...game.players]
    .sort((a, b) => b.score - a.score)
    .map(
      (player, index) =>
        `${index + 1}. <@${player.userId}> — **${player.score} puan**`,
    )
    .join("\n");
}

export function buildLobbyEmbed(game: KelimeGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("🔤 Kelime Türetme Lobisi")
    .setColor(0x3498db)
    .setDescription(
      "Sırayla kelime türetin. Oyun başladığında gösterilen kelimenin son harfiyle yeni bir Türkçe kelime yazın.\n\n" +
        `🎯 **Hedef:** ${TARGET_SCORE} puan\n` +
        "📚 Kelimeler yerleşik Türkçe kelime listesinden doğrulanır.\n" +
        "👥 En az 2, en fazla 10 oyuncu.",
    )
    .addFields({
      name: `👥 Oyuncular (${game.players.length}/${MAX_PLAYERS})`,
      value:
        game.players.map((player) => `• ${player.username}`).join("\n") ||
        "Henüz kimse yok.",
    })
    .setFooter({ text: "Kahvehane #80 • Kelime Türetme" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("kelime:join")
      .setLabel("Katıl")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("kelime:start")
      .setLabel("Başlat")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

export function buildGameEmbed(game: KelimeGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const player = currentPlayer(game);
  const requiredLetter = game.currentWord.at(-1)?.toLocaleUpperCase("tr-TR");

  const embed = new EmbedBuilder()
    .setTitle("🔤 Kelime Türetme")
    .setColor(0x2ecc71)
    .setDescription(
      `Son kelime: **${game.currentWord}**\n\n` +
        `Sıradaki kelime **${requiredLetter}** harfiyle başlamalı.\n` +
        `Sıra: <@${player.userId}>`,
    )
    .addFields(
      { name: "🏆 Puan Durumu", value: scoreLines(game) },
      {
        name: "📖 Kurallar",
        value:
          "• Yalnızca Türkçe kelimeler\n• Aynı kelime tekrar kullanılamaz\n• Kelime en az 3 harfli olmalı\n• Her harf 1 puan",
      },
    )
    .setFooter({
      text: `Hedef: ${TARGET_SCORE} puan • Kullanılan kelime: ${game.usedWords.size}`,
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

export function buildFinishedEmbed(game: KelimeGame): {
  embeds: [EmbedBuilder];
  components: [];
} {
  const winner = game.players.find((player) => player.userId === game.winner);
  const embed = new EmbedBuilder()
    .setTitle("🎉 Kelime Türetme Bitti!")
    .setColor(0xf1c40f)
    .setDescription(
      `🏆 Kazanan: <@${winner?.userId}> (**${winner?.score ?? 0} puan**)\n\n` +
        "Tüm oyuncuların puanları:",
    )
    .addFields({ name: "📊 Sonuçlar", value: scoreLines(game) })
    .setFooter({ text: "Yeni oyun için /kelime komutunu kullanın." });

  return { embeds: [embed], components: [] };
}