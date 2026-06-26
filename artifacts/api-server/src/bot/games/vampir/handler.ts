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

async function sendNightDMs(interaction: ButtonInteraction | StringSelectMenuInteraction, channelId: string) {
  const game = getGame(channelId);
  if (!game) return;

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
      /* DM kapalı olabilir */
    }
  }
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
  const parts = interaction.customId.split(":");
  const action = parts[1]!;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const game = getGame(channelId);

  if (action === "join") {
    if (!game) { await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true }); return; }
    const result = joinGame(channelId, userId, username);
    if (result === "already") { await interaction.reply({ content: "ℹ️ Zaten lobideydin.", ephemeral: true }); return; }
    if (result === "full") { await interaction.reply({ content: "❌ Lobi dolu!", ephemeral: true }); return; }
    if (result === "started") { await interaction.reply({ content: "❌ Oyun başladı.", ephemeral: true }); return; }
    await interaction.message.edit(buildLobbyEmbed(game));
    await interaction.reply({ content: "✅ Lobiye katıldın!", ephemeral: true });
    return;
  }

  if (action === "start") {
    if (!game) { await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true }); return; }
    const result = startGame(channelId, userId);
    if (result === "not_host") { await interaction.reply({ content: "❌ Sadece lobi sahibi başlatabilir.", ephemeral: true }); return; }
    if (result === "too_few") { await interaction.reply({ content: "❌ En az 4 oyuncu gerekli.", ephemeral: true }); return; }
    await interaction.reply({ content: "🌙 Oyun başladı! DM'ini kontrol et.", ephemeral: true });
    await interaction.message.edit(buildNightEmbed(game, undefined));
    await sendNightDMs(interaction, channelId);
    return;
  }

  if (!game) { await interaction.reply({ content: "❌ Aktif oyun yok.", ephemeral: true }); return; }

  if (action === "startvote") {
    if (game.phase !== "day") { await interaction.reply({ content: "❌ Şu an oylama yapılamaz.", ephemeral: true }); return; }
    game.phase = "voting";
    await interaction.message.edit(buildVotingEmbed(game));
    await interaction.reply({ content: "🗳️ Oylama başladı!", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "❌ Bilinmeyen işlem.", ephemeral: true });
}

export async function handleVampirSelect(interaction: StringSelectMenuInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[1]!;
  const userId = interaction.user.id;

  if (action === "vote") {
    const channelId = interaction.channelId;
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true }); return; }

    const targetId = interaction.values[0]!;
    const result = castVote(game, userId, targetId);
    if (result === "not_alive") { await interaction.reply({ content: "❌ Oyun dışındasın.", ephemeral: true }); return; }
    if (result === "self") { await interaction.reply({ content: "❌ Kendine oy veremezsin.", ephemeral: true }); return; }

    const target = game.players.find((p) => p.userId === targetId);
    await interaction.reply({ content: `✅ **${target?.username}** için oy kullandın.`, ephemeral: true });
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
    }
    return;
  }

  if (action === "nightaction") {
    const role = parts[2] as VampirRole;
    const targetId = interaction.values[0]!;

    const channelId = getChannelByPlayer(userId);
    if (!channelId) { await interaction.reply({ content: "❌ Aktif oyun bulunamadı.", ephemeral: true }); return; }

    const game = getGame(channelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "❌ Gece fazı değil.", ephemeral: true }); return; }

    const player = game.players.find((p) => p.userId === userId);
    if (!player || !player.alive || player.role !== role) { await interaction.reply({ content: "❌ Bu eylemi yapamazsın.", ephemeral: true }); return; }
    if (game.nightActions.actedUserIds.has(userId)) { await interaction.reply({ content: "ℹ️ Bu gece zaten eylem yaptın.", ephemeral: true }); return; }

    if (role === "vampir") game.nightActions.vampirTarget = targetId;
    if (role === "doktor") game.nightActions.doktorTarget = targetId;
    if (role === "kahin") game.nightActions.kahinTarget = targetId;
    game.nightActions.actedUserIds.add(userId);

    const targetPlayer = game.players.find((p) => p.userId === targetId);

    if (role === "kahin") {
      await interaction.reply({
        content: `🔮 **${targetPlayer?.username}** — Rol: **${ROLE_EMOJIS[targetPlayer?.role ?? "köylü"]} ${targetPlayer?.role}**`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({ content: `✅ Seçimin: **${targetPlayer?.username}**`, ephemeral: true });
    }

    await checkAndResolveNight(interaction, channelId);
    return;
  }

  await interaction.reply({ content: "❌ Bilinmeyen işlem.", ephemeral: true });
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
    if ("replied" in interaction && interaction.replied) return;
    if ("reply" in interaction) {
      await (interaction as ButtonInteraction).reply({ content: "❌ Bir hata oluştu.", ephemeral: true }).catch(() => null);
    }
  }
}
