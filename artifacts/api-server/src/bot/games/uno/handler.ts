import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChatInputCommandInteraction,
  Interaction,
} from "discord.js";
import { logger } from "../../../lib/logger";
import {
  createGame, getGame, joinGame, startGame, drawCard, playCard,
  callUno, chooseColor, endGame, buildLobbyEmbed, buildGameEmbed,
  buildHandEmbed, buildHandSelectMenu, currentPlayer,
} from "./game";
import type { UnoColor } from "./types";

export async function handleUnoCommand(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;

  const existing = getGame(channelId);
  if (existing) {
    await interaction.reply({ content: "❌ Bu kanalda zaten bir UNO oyunu var!", ephemeral: true });
    return;
  }

  const game = createGame(channelId, userId, username);
  const payload = buildLobbyEmbed(game);
  const msg = await interaction.reply({ ...payload, fetchReply: true });
  game.lastMessageId = msg.id;
}

async function refreshGameMessage(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  const game = getGame(interaction.channelId);
  if (!game) return;
  if (game.phase === "playing" || game.phase === "choosingColor") {
    const payload = buildGameEmbed(game);
    await interaction.message.edit(payload);
  } else if (game.phase === "lobby") {
    const payload = buildLobbyEmbed(game);
    await interaction.message.edit(payload);
  }
}

export async function handleUnoButton(interaction: ButtonInteraction) {
  const [, action] = interaction.customId.split(":") as [string, string];
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;

  const game = getGame(channelId);

  if (action === "join") {
    if (!game) {
      await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true });
      return;
    }
    const result = joinGame(channelId, userId, username);
    if (result === "already") {
      await interaction.reply({ content: "ℹ️ Zaten lobideydin.", ephemeral: true });
    } else if (result === "full") {
      await interaction.reply({ content: "❌ Lobi dolu!", ephemeral: true });
    } else if (result === "started") {
      await interaction.reply({ content: "❌ Oyun başladı, artık katılamazsın.", ephemeral: true });
    } else {
      await refreshGameMessage(interaction);
      await interaction.reply({ content: "✅ Lobiye katıldın!", ephemeral: true });
    }
    return;
  }

  if (action === "start") {
    if (!game) {
      await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true });
      return;
    }
    const result = startGame(channelId, userId);
    if (result === "not_host") {
      await interaction.reply({ content: "❌ Oyunu sadece lobi sahibi başlatabilir.", ephemeral: true });
    } else if (result === "too_few") {
      await interaction.reply({ content: "❌ En az 2 oyuncu gerekli.", ephemeral: true });
    } else {
      const payload = buildGameEmbed(game);
      await interaction.message.edit(payload);
      await interaction.reply({ content: "✅ UNO başladı! Elini görmek için **Elimi Gör** butonuna bas.", ephemeral: true });
    }
    return;
  }

  if (!game) {
    await interaction.reply({ content: "❌ Bu kanalda aktif oyun yok.", ephemeral: true });
    return;
  }

  if (action === "draw") {
    if (currentPlayer(game).userId !== userId) {
      await interaction.reply({ content: "❌ Sıra sende değil.", ephemeral: true });
      return;
    }
    const drawn = drawCard(channelId, userId);
    if (!drawn || drawn.length === 0) {
      await interaction.reply({ content: "❌ Deste boş!", ephemeral: true });
      return;
    }
    await refreshGameMessage(interaction);
    await interaction.reply({ content: `🂠 ${drawn.length} kart çektin.`, ephemeral: true });
    return;
  }

  if (action === "hand") {
    const handEmbed = buildHandEmbed(game, userId);
    if (!handEmbed) {
      await interaction.reply({ content: "❌ Bu oyunda değilsin.", ephemeral: true });
      return;
    }
    const isTurn = currentPlayer(game).userId === userId && game.phase === "playing";
    const components = isTurn ? (buildHandSelectMenu(game, userId) ? [buildHandSelectMenu(game, userId)!] : []) : [];
    await interaction.reply({ embeds: [handEmbed], components, ephemeral: true });
    return;
  }

  if (action === "calluno") {
    const ok = callUno(channelId, userId);
    if (ok) {
      await interaction.reply({ content: "🚨 **UNO!** Son kartın var!", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ UNO diyebilmek için elinde tam 1 kart olmalı.", ephemeral: true });
    }
    return;
  }

  await interaction.reply({ content: "❌ Bilinmeyen işlem.", ephemeral: true });
}

export async function handleUnoSelect(interaction: StringSelectMenuInteraction) {
  const [, action] = interaction.customId.split(":") as [string, string];
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (!game) {
    await interaction.reply({ content: "❌ Bu kanalda aktif oyun yok.", ephemeral: true });
    return;
  }

  if (action === "play") {
    const cardId = parseInt(interaction.values[0]!, 10);
    const result = playCard(channelId, userId, cardId);

    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
      return;
    }

    if (result.won) {
      await interaction.message.edit({
        embeds: [
          {
            title: "🎉 Oyun Bitti!",
            description: `<@${userId}> kazandı! Tebrikler!`,
            color: 0x2ecc71,
          },
        ],
        components: [],
      });
      endGame(channelId);
      await interaction.reply({ content: "🎉 Kazandın!", ephemeral: true });
      return;
    }

    if (result.needColor) {
      const colorRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("uno:color:red").setLabel("🔴 Kırmızı").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("uno:color:green").setLabel("🟢 Yeşil").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("uno:color:blue").setLabel("🔵 Mavi").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("uno:color:yellow").setLabel("🟡 Sarı").setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: "🌈 Wild oynadın! Renk seç:", components: [colorRow], ephemeral: true });
      return;
    }

    await refreshGameMessage(interaction);
    await interaction.reply({ content: "✅ Kart oynadın.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "❌ Bilinmeyen işlem.", ephemeral: true });
}

export async function handleUnoColorButton(interaction: ButtonInteraction, color: UnoColor) {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (!game) {
    await interaction.reply({ content: "❌ Oyun bulunamadı.", ephemeral: true });
    return;
  }

  const ok = chooseColor(channelId, userId, color);
  if (!ok) {
    await interaction.reply({ content: "❌ Renk seçme yetkisi sende değil.", ephemeral: true });
    return;
  }

  const mainMsg = await interaction.channel?.messages.fetch(game.lastMessageId ?? "").catch(() => null);
  if (mainMsg) {
    const payload = buildGameEmbed(game);
    await mainMsg.edit(payload);
  }

  await interaction.reply({ content: `✅ Renk **${color}** seçildi!`, ephemeral: true });
}

export async function handleUnoInteraction(interaction: Interaction) {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith("uno:color:")) {
        const color = id.split(":")[2] as UnoColor;
        await handleUnoColorButton(interaction, color);
      } else if (id.startsWith("uno:")) {
        await handleUnoButton(interaction);
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("uno:")) {
      await handleUnoSelect(interaction);
    }
  } catch (err) {
    logger.error({ err }, "UNO handler hatası");
    if ("replied" in interaction && interaction.replied) return;
    if ("deferred" in interaction && interaction.deferred) {
      await (interaction as ButtonInteraction).editReply({ content: "❌ Bir hata oluştu." });
    } else if ("reply" in interaction) {
      await (interaction as ButtonInteraction).reply({ content: "❌ Bir hata oluştu.", ephemeral: true });
    }
  }
}
