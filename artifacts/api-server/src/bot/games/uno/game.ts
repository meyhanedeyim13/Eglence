import type { UnoGame, UnoPlayer, UnoCard, UnoColor } from "./types";
import { createShuffledDeck, canPlay, cardLabel, COLOR_EMOJI } from "./deck";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

const games = new Map<string, UnoGame>();

export function getGame(channelId: string): UnoGame | undefined {
  return games.get(channelId);
}

export function createGame(channelId: string, hostId: string, hostUsername: string): UnoGame {
  const game: UnoGame = {
    channelId,
    hostId,
    players: [{ userId: hostId, username: hostUsername, hand: [], calledUno: false }],
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    phase: "lobby",
    pendingDraw: 0,
    currentColor: "red",
  };
  games.set(channelId, game);
  return game;
}

export function joinGame(channelId: string, userId: string, username: string): "ok" | "full" | "already" | "no_game" | "started" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.phase !== "lobby") return "started";
  if (game.players.find((p) => p.userId === userId)) return "already";
  if (game.players.length >= 10) return "full";
  game.players.push({ userId, username, hand: [], calledUno: false });
  return "ok";
}

export function startGame(channelId: string, userId: string): "ok" | "not_host" | "no_game" | "too_few" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.hostId !== userId) return "not_host";
  if (game.players.length < 2) return "too_few";

  game.deck = createShuffledDeck();

  for (const player of game.players) {
    player.hand = game.deck.splice(0, 7);
  }

  let topCard: UnoCard;
  do {
    topCard = game.deck.shift()!;
    if (topCard.color === "wild") game.deck.push(topCard);
  } while (topCard.color === "wild");

  game.discardPile = [topCard];
  game.currentColor = topCard.color as UnoColor;
  game.phase = "playing";
  return "ok";
}

export function currentPlayer(game: UnoGame): UnoPlayer {
  return game.players[game.currentPlayerIndex]!;
}

function drawFromDeck(game: UnoGame, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (game.deck.length === 0) {
      const top = game.discardPile.pop()!;
      game.deck = game.discardPile.sort(() => Math.random() - 0.5);
      game.discardPile = [top];
    }
    if (game.deck.length > 0) drawn.push(game.deck.shift()!);
  }
  return drawn;
}

function nextTurn(game: UnoGame, skip = false) {
  const step = skip ? 2 : 1;
  game.currentPlayerIndex =
    ((game.currentPlayerIndex + game.direction * step) + game.players.length * 10) %
    game.players.length;
  game.players.forEach((p) => (p.calledUno = false));
}

export type PlayResult =
  | { ok: true; effect?: "skip" | "reverse" | "draw2" | "wilddraw4" | "wild"; needColor: boolean; won: boolean }
  | { ok: false; reason: string };

export function playCard(channelId: string, userId: string, cardId: number): PlayResult {
  const game = games.get(channelId);
  if (!game || game.phase !== "playing") return { ok: false, reason: "Oyun yok." };
  const player = currentPlayer(game);
  if (player.userId !== userId) return { ok: false, reason: "Sıra sende değil." };

  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { ok: false, reason: "Bu kart elinde değil." };
  const card = player.hand[cardIdx]!;
  const top = game.discardPile[game.discardPile.length - 1]!;

  if (!canPlay(card, top, game.currentColor)) {
    return { ok: false, reason: "Bu kartı şu an oynayamazsın." };
  }

  if (player.hand.length === 2 && !player.calledUno) {
    const drawn = drawFromDeck(game, 2);
    player.hand.push(...drawn);
    return { ok: false, reason: "UNO demeden kart oynadın! 2 kart çektin." };
  }

  player.hand.splice(cardIdx, 1);
  game.discardPile.push(card);

  if (player.hand.length === 0) {
    game.phase = "finished";
    game.winner = userId;
    return { ok: true, needColor: false, won: true };
  }

  let needColor = false;

  if (card.value === "reverse") {
    game.direction = (game.direction * -1) as 1 | -1;
    if (game.players.length === 2) {
      nextTurn(game, true);
    } else {
      nextTurn(game);
    }
    return { ok: true, effect: "reverse", needColor: false, won: false };
  }

  if (card.value === "skip") {
    nextTurn(game, true);
    return { ok: true, effect: "skip", needColor: false, won: false };
  }

  if (card.value === "draw2") {
    game.pendingDraw += 2;
    nextTurn(game);
    const next = currentPlayer(game);
    const drawn = drawFromDeck(game, game.pendingDraw);
    next.hand.push(...drawn);
    game.pendingDraw = 0;
    nextTurn(game);
    return { ok: true, effect: "draw2", needColor: false, won: false };
  }

  if (card.value === "wild" || card.value === "wilddraw4") {
    game.phase = "choosingColor";
    needColor = true;
    if (card.value === "wilddraw4") game.pendingDraw += 4;
    return { ok: true, effect: card.value === "wild" ? "wild" : "wilddraw4", needColor: true, won: false };
  }

  game.currentColor = card.color as UnoColor;
  nextTurn(game);
  return { ok: true, needColor: false, won: false };
}

export function chooseColor(channelId: string, userId: string, color: UnoColor): boolean {
  const game = games.get(channelId);
  if (!game || game.phase !== "choosingColor") return false;
  if (currentPlayer(game).userId !== userId) return false;
  game.currentColor = color;
  game.phase = "playing";

  if (game.pendingDraw > 0) {
    nextTurn(game);
    const next = currentPlayer(game);
    const drawn = drawFromDeck(game, game.pendingDraw);
    next.hand.push(...drawn);
    game.pendingDraw = 0;
    nextTurn(game);
  } else {
    nextTurn(game);
  }
  return true;
}

export function drawCard(channelId: string, userId: string): UnoCard[] | null {
  const game = games.get(channelId);
  if (!game || game.phase !== "playing") return null;
  if (currentPlayer(game).userId !== userId) return null;
  const drawn = drawFromDeck(game, 1);
  currentPlayer(game).hand.push(...drawn);
  nextTurn(game);
  return drawn;
}

export function callUno(channelId: string, userId: string): boolean {
  const game = games.get(channelId);
  if (!game) return false;
  const player = game.players.find((p) => p.userId === userId);
  if (!player || player.hand.length !== 1) return false;
  player.calledUno = true;
  return true;
}

export function endGame(channelId: string) {
  games.delete(channelId);
}

export function buildGameEmbed(game: UnoGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const top = game.discardPile[game.discardPile.length - 1]!;
  const cp = currentPlayer(game);

  const embed = new EmbedBuilder()
    .setTitle("🃏 UNO Oyunu")
    .setColor(
      game.currentColor === "red" ? 0xe74c3c :
      game.currentColor === "green" ? 0x2ecc71 :
      game.currentColor === "blue" ? 0x3498db : 0xf1c40f,
    )
    .addFields(
      {
        name: "🂠 Üstteki Kart",
        value: `${cardLabel(top)}  •  Renk: ${COLOR_EMOJI[game.currentColor]} `,
        inline: true,
      },
      {
        name: "🎮 Sıra",
        value: `<@${cp.userId}>`,
        inline: true,
      },
      {
        name: "👥 Oyuncular",
        value: game.players
          .map(
            (p, i) =>
              `${i === game.currentPlayerIndex ? "▶️" : "◾"} <@${p.userId}> — ${p.hand.length} kart${p.calledUno ? " **UNO!**" : ""}`,
          )
          .join("\n"),
      },
    )
    .setFooter({ text: `Yön: ${game.direction === 1 ? "➡️ Saat yönü" : "⬅️ Ters"} • Deste: ${game.deck.length} kart` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("uno:draw").setLabel("Kart Çek").setEmoji("🂠").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("uno:hand").setLabel("Elimi Gör").setEmoji("👁️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("uno:calluno").setLabel("UNO!").setEmoji("🚨").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

export function buildLobbyEmbed(game: UnoGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("🃏 UNO Lobisi")
    .setColor(0xf39c12)
    .setDescription("Oyuna katılmak için **Katıl** butonuna bas!\nEn az 2 oyuncu gerekli. Maksimum 10 oyuncu.")
    .addFields({
      name: `👥 Oyuncular (${game.players.length}/10)`,
      value: game.players.map((p) => `• ${p.username}`).join("\n"),
    })
    .setFooter({ text: "Kahvehane #80 • UNO" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("uno:join").setLabel("Katıl").setEmoji("🃏").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("uno:start").setLabel("Başlat").setEmoji("▶️").setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

export function buildHandEmbed(game: UnoGame, userId: string): EmbedBuilder | null {
  const player = game.players.find((p) => p.userId === userId);
  if (!player) return null;
  const top = game.discardPile[game.discardPile.length - 1]!;

  const playable = player.hand.filter((c) => canPlay(c, top, game.currentColor));

  const embed = new EmbedBuilder()
    .setTitle("🤚 Elin")
    .setColor(0x2c3e50)
    .setDescription(
      player.hand
        .map((c, i) => {
          const play = canPlay(c, top, game.currentColor) ? "✅" : "❌";
          return `\`${i + 1}.\` ${cardLabel(c)} ${play}`;
        })
        .join("\n") || "Elin boş!",
    )
    .setFooter({ text: `Oynanabilir kart: ${playable.length} • Toplam: ${player.hand.length}` });

  return embed;
}

export function buildHandSelectMenu(game: UnoGame, userId: string): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const player = game.players.find((p) => p.userId === userId);
  if (!player) return null;
  const top = game.discardPile[game.discardPile.length - 1]!;

  const playable = player.hand.filter((c) => canPlay(c, top, game.currentColor));
  if (playable.length === 0) return null;

  const options = playable.slice(0, 25).map((c) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(cardLabel(c))
      .setValue(String(c.id))
      .setEmoji(COLOR_EMOJI[c.color] ?? "⚫"),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("uno:play")
    .setPlaceholder("Oynamak istediğin kartı seç...")
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
