import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Interaction,
} from "discord.js";
import { logger } from "../../../lib/logger";
import {
  buildGameEmbed,
  buildHandEmbed,
  buildHandSelectMenu,
  buildLobbyEmbed,
  callUno,
  chooseColor,
  createGame,
  currentPlayer,
  drawCard,
  endGame,
  getGame,
  joinGame,
  playCard,
  startGame,
} from "./game";
import type { UnoColor } from "./types";

export async function handleUnoCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  if (getGame(channelId)) {
    await interaction.reply({
      content: "❌ Bu kanalda zaten bir UNO oyunu var!",
      ephemeral: true,
    });
    return;
  }

  const game = createGame(
    channelId,
    interaction.user.id,
    interaction.user.displayName,
  );
  const message = await interaction.reply({
    ...buildLobbyEmbed(game),
    fetchReply: true,
  });
  game.lastMessageId = message.id;
}

async function getMainMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const game = getGame(interaction.channelId);
  if (!game?.lastMessageId) return null;
  if (interaction.channel?.type !== ChannelType.GuildText) return null;

  return (interaction.channel as TextChannel).messages
    .fetch(game.lastMessageId)
    .catch(() => null);
}

async function refreshGameMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const game = getGame(interaction.channelId);
  const message = await getMainMessage(interaction);
  if (!game || !message) return;

  if (game.phase === "playing" || game.phase === "choosingColor") {
    await message.edit(buildGameEmbed(game));
  } else if (game.phase === "lobby") {
    await message.edit(buildLobbyEmbed(game));
  }
}

export async function handleUnoButton(
  interaction: ButtonInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const [, action] = interaction.customId.split(":") as [string, string];
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (action === "join") {
    if (!game) {
      await interaction.editReply("❌ Oyun bulunamadı.");
      return;
    }
    const result = joinGame(channelId, userId, interaction.user.displayName);
    if (result === "already") {
      await interaction.editReply("ℹ️ Zaten lobidesin.");
    } else if (result === "full") {
      await interaction.editReply("❌ Lobi dolu.");
    } else if (result === "started") {
      await interaction.editReply("❌ Oyun başladı, artık katılamazsın.");
    } else {
      await refreshGameMessage(interaction);
      await interaction.editReply("✅ Lobiye katıldın!");
    }
    return;
  }

  if (action === "start") {
    if (!game) {
      await interaction.editReply("❌ Oyun bulunamadı.");
      return;
    }
    const result = startGame(channelId, userId);
    if (result === "not_host") {
      await interaction.editReply("❌ Oyunu sadece lobi sahibi başlatabilir.");
    } else if (result === "too_few") {
      await interaction.editReply("❌ En az 2 oyuncu gerekli.");
    } else if (result !== "ok") {
      await interaction.editReply("❌ Oyun bulunamadı.");
    } else {
      await refreshGameMessage(interaction);
      await interaction.editReply(
        "✅ UNO başladı! Elini görmek için **Elimi Gör** butonuna bas.",
      );
    }
    return;
  }

  if (!game) {
    await interaction.editReply("❌ Bu kanalda aktif oyun yok.");
    return;
  }

  if (action === "draw") {
    if (currentPlayer(game).userId !== userId) {
      await interaction.editReply("❌ Sıra sende değil.");
      return;
    }
    const drawn = drawCard(channelId, userId);
    if (!drawn || drawn.length === 0) {
      await interaction.editReply("❌ Deste boş.");
      return;
    }
    await refreshGameMessage(interaction);
    await interaction.editReply(`🂠 ${drawn.length} kart çektin.`);
    return;
  }

  if (action === "hand") {
    const handEmbed = buildHandEmbed(game, userId);
    if (!handEmbed) {
      await interaction.editReply("❌ Bu oyunda değilsin.");
      return;
    }

    const selectMenu =
      currentPlayer(game).userId === userId && game.phase === "playing"
        ? buildHandSelectMenu(game, userId)
        : null;
    await interaction.editReply({
      embeds: [handEmbed],
      components: selectMenu ? [selectMenu] : [],
    });
    return;
  }

  if (action === "calluno") {
    const ok = callUno(channelId, userId);
    await interaction.editReply(
      ok
        ? "🚨 **UNO!** Son kartın var!"
        : "❌ UNO diyebilmek için elinde tam 1 kart olmalı.",
    );
    return;
  }

  await interaction.editReply("❌ Bilinmeyen işlem.");
}

export async function handleUnoSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const [, action] = interaction.customId.split(":") as [string, string];
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (!game) {
    await interaction.editReply("❌ Bu kanalda aktif oyun yok.");
    return;
  }

  if (action !== "play") {
    await interaction.editReply("❌ Bilinmeyen işlem.");
    return;
  }

  const cardId = Number.parseInt(interaction.values[0]!, 10);
  const result = playCard(channelId, userId, cardId);
  if (!result.ok) {
    await interaction.editReply(`❌ ${result.reason}`);
    return;
  }

  if (result.won) {
    const message = await getMainMessage(interaction);
    if (message) {
      await message.edit({
        embeds: [
          {
            title: "🎉 UNO Bitti!",
            description: `<@${userId}> kazandı! Tebrikler!`,
            color: 0x2ecc71,
          },
        ],
        components: [],
      });
    }
    endGame(channelId);
    await interaction.editReply("🎉 Kazandın!");
    return;
  }

  if (result.needColor) {
    const colorRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("uno:color:red")
        .setLabel("🔴 Kırmızı")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("uno:color:green")
        .setLabel("🟢 Yeşil")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("uno:color:blue")
        .setLabel("🔵 Mavi")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("uno:color:yellow")
        .setLabel("🟡 Sarı")
        .setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({
      content: "🌈 Wild oynadın! Renk seç:",
      components: [colorRow],
    });
    return;
  }

  await refreshGameMessage(interaction);
  await interaction.editReply("✅ Kart oynadın.");
}

export async function handleUnoColorButton(
  interaction: ButtonInteraction,
  color: UnoColor,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (!game) {
    await interaction.editReply("❌ Oyun bulunamadı.");
    return;
  }

  if (!chooseColor(channelId, userId, color)) {
    await interaction.editReply("❌ Renk seçme yetkisi sende değil.");
    return;
  }

  await refreshGameMessage(interaction);
  await interaction.editReply(`✅ Renk **${color}** seçildi!`);
}

export async function handleUnoInteraction(
  interaction: Interaction,
): Promise<void> {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith("uno:color:")) {
        await handleUnoColorButton(
          interaction,
          id.split(":")[2] as UnoColor,
        );
      } else if (id.startsWith("uno:")) {
        await handleUnoButton(interaction);
      }
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("uno:")
    ) {
      await handleUnoSelect(interaction);
    }
  } catch (err) {
    logger.error({ err }, "UNO handler hatası");
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ content: "❌ Bir hata oluştu." })
          .catch(() => null);
      } else {
        await interaction
          .reply({ content: "❌ Bir hata oluştu.", ephemeral: true })
          .catch(() => null);
      }
    }
  }
}