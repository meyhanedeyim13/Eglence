import type { VampirGame, VampirPlayer, VampirRole, GamePhase } from "./types";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

const games = new Map<string, VampirGame>();
const playerChannelMap = new Map<string, string>();

export function getGame(channelId: string): VampirGame | undefined {
  return games.get(channelId);
}

export function getChannelByPlayer(userId: string): string | undefined {
  return playerChannelMap.get(userId);
}

export function createGame(channelId: string, hostId: string, hostUsername: string): VampirGame {
  const game: VampirGame = {
    channelId,
    hostId,
    players: [],
    phase: "lobby",
    nightActions: { actedUserIds: new Set() },
    votes: new Map(),
    roundNumber: 0,
  };
  game.players.push({ userId: hostId, username: hostUsername, role: "köylü", alive: true, protected: false });
  games.set(channelId, game);
  return game;
}

export function joinGame(channelId: string, userId: string, username: string): "ok" | "full" | "already" | "no_game" | "started" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.phase !== "lobby") return "started";
  if (game.players.find((p) => p.userId === userId)) return "already";
  if (game.players.length >= 15) return "full";
  game.players.push({ userId, username, role: "köylü", alive: true, protected: false });
  return "ok";
}

function assignRoles(players: VampirPlayer[], count: number) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const roleList: VampirRole[] = [];

  const vampirCount = count <= 4 ? 1 : count <= 8 ? 2 : 3;
  for (let i = 0; i < vampirCount; i++) roleList.push("vampir");
  if (count >= 4) roleList.push("doktor");
  if (count >= 5) roleList.push("kahin");
  while (roleList.length < count) roleList.push("köylü");

  shuffled.forEach((p, i) => {
    p.role = roleList[i]!;
  });
}

export function startGame(channelId: string, userId: string): "ok" | "not_host" | "no_game" | "too_few" {
  const game = games.get(channelId);
  if (!game) return "no_game";
  if (game.hostId !== userId) return "not_host";
  if (game.players.length < 4) return "too_few";

  assignRoles(game.players, game.players.length);
  game.phase = "night";
  game.roundNumber = 1;
  game.nightActions = { actedUserIds: new Set() };
  for (const p of game.players) playerChannelMap.set(p.userId, channelId);
  return "ok";
}

export function alivePlayers(game: VampirGame): VampirPlayer[] {
  return game.players.filter((p) => p.alive);
}

export function aliveByRole(game: VampirGame, role: VampirRole): VampirPlayer[] {
  return game.players.filter((p) => p.alive && p.role === role);
}

export function getRolesNeededForNight(game: VampirGame): VampirRole[] {
  const needed: VampirRole[] = ["vampir"];
  if (aliveByRole(game, "doktor").length > 0) needed.push("doktor");
  if (aliveByRole(game, "kahin").length > 0) needed.push("kahin");
  return needed;
}

export function hasAllNightActed(game: VampirGame): boolean {
  const needed = getRolesNeededForNight(game);
  for (const role of needed) {
    const players = aliveByRole(game, role);
    const acted = players.some((p) => game.nightActions.actedUserIds.has(p.userId));
    if (!acted) return false;
  }
  return true;
}

export function resolveNight(game: VampirGame): { killed?: string; saved: boolean; kahinResult?: { target: string; role: VampirRole } } {
  const { vampirTarget, doktorTarget, kahinTarget } = game.nightActions;
  let killed: string | undefined;
  let saved = false;

  if (vampirTarget) {
    if (doktorTarget === vampirTarget) {
      saved = true;
    } else {
      const victim = game.players.find((p) => p.userId === vampirTarget);
      if (victim) {
        victim.alive = false;
        killed = vampirTarget;
        game.nightKilled = vampirTarget;
      }
    }
  }

  let kahinResult: { target: string; role: VampirRole } | undefined;
  if (kahinTarget) {
    const target = game.players.find((p) => p.userId === kahinTarget);
    if (target) kahinResult = { target: kahinTarget, role: target.role };
  }

  game.nightActions = { actedUserIds: new Set() };
  game.phase = "day";
  return { killed, saved, kahinResult };
}

export function checkWinCondition(game: VampirGame): "vampir" | "köylü" | null {
  const aliveVampirs = aliveByRole(game, "vampir").length;
  const aliveVillagers = alivePlayers(game).filter((p) => p.role !== "vampir").length;

  if (aliveVampirs === 0) return "köylü";
  if (aliveVampirs >= aliveVillagers) return "vampir";
  return null;
}

export function castVote(game: VampirGame, voterId: string, targetId: string): "ok" | "not_alive" | "self" | "no_game" {
  if (game.phase !== "voting") return "no_game";
  const voter = game.players.find((p) => p.userId === voterId && p.alive);
  if (!voter) return "not_alive";
  if (voterId === targetId) return "self";
  game.votes.set(voterId, targetId);
  return "ok";
}

export function resolveVoting(game: VampirGame): string | null {
  const tally = new Map<string, number>();
  for (const [, target] of game.votes) {
    tally.set(target, (tally.get(target) ?? 0) + 1);
  }

  let maxVotes = 0;
  let eliminated: string | null = null;
  for (const [userId, votes] of tally) {
    if (votes > maxVotes) {
      maxVotes = votes;
      eliminated = userId;
    } else if (votes === maxVotes) {
      eliminated = null;
    }
  }

  if (eliminated) {
    const player = game.players.find((p) => p.userId === eliminated);
    if (player) {
      player.alive = false;
      game.dayKilled = eliminated;
    }
  }

  game.votes = new Map();
  game.roundNumber++;
  game.phase = "night";
  game.nightActions = { actedUserIds: new Set() };
  return eliminated;
}

export function endGame(channelId: string) {
  const game = games.get(channelId);
  if (game) {
    for (const p of game.players) playerChannelMap.delete(p.userId);
  }
  games.delete(channelId);
}

export function buildLobbyEmbed(game: VampirGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("🧛 Vampir Köylü Lobisi")
    .setColor(0x8b0000)
    .setDescription(
      "Oyuna katılmak için **Katıl** butonuna bas!\n\n" +
      "**Roller:**\n" +
      "🧛 Vampir • 👨 Köylü • 💉 Doktor • 🔮 Kahin\n\n" +
      "En az **4** oyuncu gerekli.",
    )
    .addFields({
      name: `👥 Oyuncular (${game.players.length}/15)`,
      value: game.players.map((p) => `• ${p.username}`).join("\n") || "Henüz kimse yok.",
    })
    .setFooter({ text: "Kahvehane #80 • Vampir Köylü" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("vampir:join").setLabel("Katıl").setEmoji("🧛").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("vampir:start").setLabel("Başlat").setEmoji("▶️").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

export function buildDayEmbed(game: VampirGame, nightResult: { killed?: string; saved: boolean }): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const alive = alivePlayers(game);

  let nightText = "";
  if (nightResult.killed) {
    const victim = game.players.find((p) => p.userId === nightResult.killed);
    nightText = `☠️ Gece **${victim?.username}** öldürüldü!`;
  } else if (nightResult.saved) {
    nightText = "💉 Gece bir saldırı oldu ama **Doktor kurtardı!**";
  } else {
    nightText = "🌅 Gece sessiz geçti, kimse ölmedi.";
  }

  const embed = new EmbedBuilder()
    .setTitle(`☀️ Gündüz — Tur ${game.roundNumber}`)
    .setColor(0xf39c12)
    .setDescription(`${nightText}\n\nTartışın! Ardından **Oylama Başlat** ile vampir şüphelisini belirleyin.`)
    .addFields({
      name: `💚 Hayatta (${alive.length})`,
      value: alive.map((p) => `• ${p.username}`).join("\n"),
    })
    .setFooter({ text: "Kahvehane #80 • Vampir Köylü" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("vampir:startvote").setLabel("Oylama Başlat").setEmoji("🗳️").setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

export function buildVotingEmbed(game: VampirGame): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} {
  const alive = alivePlayers(game);
  const voted = game.votes.size;

  const embed = new EmbedBuilder()
    .setTitle("🗳️ Oylama")
    .setColor(0xe74c3c)
    .setDescription("Vampir olduğunu düşündüğün kişiye oy ver!\nHer oyuncu **bir kez** oy kullanabilir.")
    .addFields(
      {
        name: "💚 Adaylar",
        value: alive.map((p) => `• ${p.username}`).join("\n"),
      },
      {
        name: "📊 Oy Durumu",
        value: `${voted}/${alive.length} oy kullanıldı`,
        inline: true,
      },
    )
    .setFooter({ text: "Kahvehane #80 • Vampir Köylü" });

  const options = alive.map((p) =>
    new StringSelectMenuOptionBuilder().setLabel(p.username).setValue(p.userId),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("vampir:vote")
    .setPlaceholder("Oyunu kullan...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  return { embeds: [embed], components: [row] };
}

export function buildNightEmbed(game: VampirGame, eliminated?: string | null): {
  embeds: [EmbedBuilder];
  components: [];
} {
  let elimText = "";
  if (eliminated) {
    const el = game.players.find((p) => p.userId === eliminated);
    elimText = `\n\n🗡️ Oylama sonucu **${el?.username}** (${el?.role}) idam edildi!`;
  } else if (eliminated === null) {
    elimText = "\n\n🤝 Oylamada eşitlik — kimse idam edilmedi!";
  }

  const embed = new EmbedBuilder()
    .setTitle(`🌙 Gece — Tur ${game.roundNumber}`)
    .setColor(0x2c3e50)
    .setDescription(
      `${elimText}\n\nHerkes uyusun... 🌙\n\nÖzel rollere DM gönderildi. Lütfen DM'den eylemini gerçekleştir.`,
    )
    .setFooter({ text: "Kahvehane #80 • Vampir Köylü" });

  return { embeds: [embed], components: [] };
}

export function buildNightActionEmbed(role: VampirRole, players: VampirPlayer[]): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} {
  const titles: Record<VampirRole, string> = {
    vampir: "🧛 Vampir — Kurban Seç",
    doktor: "💉 Doktor — Kimi Kurtaracaksın?",
    kahin: "🔮 Kahin — Kimi İnceleyeceksin?",
    köylü: "👨 Köylü",
  };

  const descs: Record<VampirRole, string> = {
    vampir: "Bu gece hangi köylüyü öldürmek istiyorsun?",
    doktor: "Bu gece kimi korumak istiyorsun?",
    kahin: "Kimin rolünü öğrenmek istiyorsun?",
    köylü: "Bu gece yapacak bir şeyin yok.",
  };

  const embed = new EmbedBuilder()
    .setTitle(titles[role])
    .setDescription(descs[role])
    .setColor(role === "vampir" ? 0x8b0000 : role === "doktor" ? 0x27ae60 : 0x8e44ad)
    .setFooter({ text: "Kahvehane #80 • Vampir Köylü" });

  const options = players.map((p) =>
    new StringSelectMenuOptionBuilder().setLabel(p.username).setValue(p.userId),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`vampir:nightaction:${role}`)
    .setPlaceholder("Seçimini yap...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}
