import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChatInputCommandInteraction,
  Interaction,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { logger } from "../../../lib/logger";
import {
  createGame, getGame, getChannelByPlayer, joinGame, startGame,
  alivePlayers, aliveByRole, resolveNight, resolveVoting, checkWinCondition,
  castVote, endGame, hasAllNightActed, buildLobbyEmbed, buildDayEmbed,
  buildVotingEmbed, buildNightEmbed, buildNightActionEmbed,
} from "./game";
import type { VampirRole } from "./types";

const ROLE_EMOJIS: Record<VampirRole, string> = {
  vampir: "🧛", köylü: "👨", doktor: "💉", kahin: "🔮",
};

export async function handleVampirCommand(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;

  if (getGame(channelId)) {
    await interaction.reply({ content: "❌ Bu kanalda zaten bir Vampir Köylü oyunu var!", ephemeral: true });
    return;
  }

  const game = createGame(channelId, userId, username);
  const msg = await interaction.reply({ ...buildLobbyEmbed(game), fetchReply: true });
  game.lastMessageId = msg.id;
}

async function sendNightDMs(interaction: ButtonInteraction | StringSelectMenuInteraction, channelId: string): Promise<string[]> {
  const game = getGame(channelId);
  if (!game) return [];
  const failed: string[] = [];

  for (const player of alivePlayers(game)) {
    try {
      const user = await interaction.client.users.fetch(player.userId);
      const dm = await user.createDM();

      if (player.role === "köylü") {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🌙 Gece Başladı")
              .setDescription(`Rolün: **${ROLE_EMOJIS.köylü} Köylü**\n\nBu gece yapacak bir şeyin yok. 😴`)
              .setColor(0x2c3e50),
          ],
        });
        continue;
      }

      const targets = alivePlayers(game).filter((p) =>
        player.role === "vampir" ? p.role !== "vampir" : p.userId !== player.userId,
      );
      await dm.send(buildNightActionEmbed(player.role, targets));
    } catch {
      failed.push(player.username);
      if (player.role !== "köylü") {
        game.nightActions.actedUserIds.add(player.userId);
      }
    }
  }
  return failed;
}

async function checkAndResolveNight(interaction: ButtonInteraction | StringSelectMenuInteraction, channelId: string) {
  const game = getGame(channelId);
  if (!game || game.phase !== "night" || !hasAllNightActed(game)) return;

  const result = resolveNight(game);
  const win = checkWinCondition(game);

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  if (win) {
    const winners =
      win === "vampir"
        ? game.players.filter((p) => p.role === "vampir").map((p) => p.username).join(", ")
        : game.players.filter((p) => p.role !== "vampir").map((p) => p.username).join(", ");

    const finalEmbed = new EmbedBuilder()
      .setTitle(win === "vampir" ? "🧛 Vampirler Kazandı!" : "👨 Köylüler Kazandı!")
      .setDescription(
        `**Kazananlar:** ${winners}\n\n**Tüm Roller:**\n` +
        game.players.map((p) => `• ${p.username} — ${ROLE_EMOJIS[p.role]} ${p.role}`).join("\n"),
      )
      .setColor(win === "vampir" ? 0x8b0000 : 0x27ae60);

    if (game.lastMessageId) {
      const msg = await channel.messages.fetch(game.lastMessageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [finalEmbed], components: [] });
    }
    endGame(channelId);
    return;
  }

  const dayPayload = buildDayEmbed(game, result);
  if (game.lastMessageId) {
    const msg = await channel.messages.fetch(game.lastMessageId).catch(() => null);
    if (msg) {
      const edited = await msg.edit(dayPayload);
      game.lastMessageId = edited.id;
    }
  }
}

export async function handleVampirButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const parts = interaction.customId.split(":");
  const action = parts[1]!;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const game = getGame(channelId);

  if (action === "join") {
    if (!game) { await interaction.editReply("❌ Oyun bulunamadı."); return; }
    const result = joinGame(channelId, userId, username);
    if (result === "already") { await interaction.editReply("ℹ️ Zaten lobideydin."); return; }
    if (result === "full") { await interaction.editReply("❌ Lobi dolu!"); return; }
    if (result === "started") { await interaction.editReply("❌ Oyun başladı."); return; }
    await interaction.message.edit(buildLobbyEmbed(game));
    await interaction.editReply("✅ Lobiye katıldın!");
    return;
  }

  if (action === "start") {
    if (!game) { await interaction.editReply("❌ Oyun bulunamadı."); return; }
    const result = startGame(channelId, userId);
    if (result === "not_host") { await interaction.editReply("❌ Sadece lobi sahibi başlatabilir."); return; }
    if (result === "too_few") { await interaction.editReply("❌ En az 4 oyuncu gerekli."); return; }
    if (result !== "ok") { await interaction.editReply("❌ Oyun bulunamadı."); return; }
    await interaction.message.edit(buildNightEmbed(game, undefined));
    const failedDMs = await sendNightDMs(interaction, channelId);
    await interaction.editReply(
      failedDMs.length > 0
        ? `🌙 Oyun başladı. DM'si kapalı olanlar: **${failedDMs.join(", ")}**. Bu kişilerin Discord'dan özel mesaj almayı açması gerekiyor.`
        : "🌙 Oyun başladı! DM'ini kontrol et.",
    );
    await checkAndResolveNight(interaction, channelId);
    return;
  }

  if (!game) { await interaction.editReply("❌ Aktif oyun yok."); return; }

  if (action === "startvote") {
    if (game.phase !== "day") { await interaction.editReply("❌ Şu an oylama yapılamaz."); return; }
    game.phase = "voting";
    await interaction.message.edit(buildVotingEmbed(game));
    await interaction.editReply("🗳️ Oylama başladı!");
    return;
  }

  await interaction.editReply("❌ Bilinmeyen işlem.");
}

export async function handleVampirSelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const parts = interaction.customId.split(":");
  const action = parts[1]!;
  const userId = interaction.user.id;

  if (action === "vote") {
    const channelId = interaction.channelId;
    const game = getGame(channelId);
    if (!game) { await interaction.editReply("❌ Oyun bulunamadı."); return; }

    const targetId = interaction.values[0]!;
    const result = castVote(game, userId, targetId);
    if (result === "not_alive") { await interaction.editReply("❌ Oyun dışındasın."); return; }
    if (result === "self") { await interaction.editReply("❌ Kendine oy veremezsin."); return; }

    const target = game.players.find((p) => p.userId === targetId);
    await interaction.editReply(`✅ **${target?.username}** için oy kullandın.`);
    await interaction.message.edit(buildVotingEmbed(game));

    if (game.votes.size >= alivePlayers(game).length) {
      const eliminated = resolveVoting(game);
      const win = checkWinCondition(game);

      if (win) {
        const winners =
          win === "vampir"
            ? game.players.filter((p) => p.role === "vampir").map((p) => p.username).join(", ")
            : game.players.filter((p) => p.role !== "vampir").map((p) => p.username).join(", ");

        await interaction.message.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle(win === "vampir" ? "🧛 Vampirler Kazandı!" : "👨 Köylüler Kazandı!")
              .setDescription(
                `**Kazananlar:** ${winners}\n\n**Tüm Roller:**\n` +
                game.players.map((p) => `• ${p.username} — ${ROLE_EMOJIS[p.role]} ${p.role}`).join("\n"),
              )
              .setColor(win === "vampir" ? 0x8b0000 : 0x27ae60),
          ],
          components: [],
        });
        endGame(channelId);
        return;
      }

      const nightPayload = buildNightEmbed(game, eliminated);
      const edited = await interaction.message.edit(nightPayload);
      game.lastMessageId = edited.id;
      await sendNightDMs(interaction, channelId);
      await checkAndResolveNight(interaction, channelId);
    }
    return;
  }

  if (action === "nightaction") {
    const role = parts[2] as VampirRole;
    const targetId = interaction.values[0]!;

    const channelId = getChannelByPlayer(userId);
    if (!channelId) { await interaction.editReply("❌ Aktif oyun bulunamadı."); return; }

    const game = getGame(channelId);
    if (!game || game.phase !== "night") { await interaction.editReply("❌ Gece fazı değil."); return; }

    const player = game.players.find((p) => p.userId === userId);
    if (!player || !player.alive || player.role !== role) { await interaction.editReply("❌ Bu eylemi yapamazsın."); return; }
    if (game.nightActions.actedUserIds.has(userId)) { await interaction.editReply("ℹ️ Bu gece zaten eylem yaptın."); return; }

    if (role === "vampir") game.nightActions.vampirTarget = targetId;
    if (role === "doktor") game.nightActions.doktorTarget = targetId;
    if (role === "kahin") game.nightActions.kahinTarget = targetId;
    game.nightActions.actedUserIds.add(userId);

    const targetPlayer = game.players.find((p) => p.userId === targetId);

    if (role === "kahin") {
      await interaction.editReply(
        `🔮 **${targetPlayer?.username}** — Rol: **${ROLE_EMOJIS[targetPlayer?.role ?? "köylü"]} ${targetPlayer?.role}**`,
      );
    } else {
      await interaction.editReply(`✅ Seçimin: **${targetPlayer?.username}**`);
    }

    await checkAndResolveNight(interaction, channelId);
    return;
  }

  await interaction.editReply("❌ Bilinmeyen işlem.");
}

export async function handleVampirInteraction(interaction: Interaction) {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("vampir:")) {
      await handleVampirButton(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("vampir:")) {
      await handleVampirSelect(interaction);
    }
  } catch (err) {
    logger.error({ err }, "Vampir handler hatası");
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ Bir hata oluştu." }).catch(() => null);
      } else {
        await interaction.reply({ content: "❌ Bir hata oluştu.", ephemeral: true }).catch(() => null);
      }
    }
  }
}
