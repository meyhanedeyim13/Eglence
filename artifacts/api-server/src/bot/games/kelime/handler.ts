import {
  ActionRowBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  TextChannel,
} from "discord.js";
import { logger } from "../../../lib/logger";
import {
  buildFinishedEmbed,
  buildGameEmbed,
  buildLobbyEmbed,
  createGame,
  currentPlayer,
  endGame,
  getGame,
  joinGame,
  startGame,
  submitWord,
} from "./game";

export async function handleKelimeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  if (getGame(channelId)) {
    await interaction.reply({
      content: "❌ Bu kanalda zaten aktif bir kelime oyunu var!",
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

async function refreshGameMessage(
  interaction: Interaction,
  channelId: string,
  messageId: string | undefined,
): Promise<void> {
  if (!messageId) return;
  const channel = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const textChannel = channel as TextChannel;
  const message = await textChannel.messages.fetch(messageId).catch(() => null);
  const game = getGame(channelId);
  if (!message || !game) return;

  await message.edit(
    game.phase === "finished" ? buildFinishedEmbed(game) : buildGameEmbed(game),
  );
}

async function handleKelimeButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const action = interaction.customId.split(":")[1];
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const game = getGame(channelId);

  if (action === "join") {
    if (!game) {
      await interaction.reply({
        content: "❌ Oyun bulunamadı.",
        ephemeral: true,
      });
      return;
    }

    const result = joinGame(channelId, userId, interaction.user.displayName);
    const messages = {
      already: "ℹ️ Zaten lobidesin.",
      full: "❌ Lobi dolu.",
      started: "❌ Oyun başladı, artık katılamazsın.",
      no_game: "❌ Oyun bulunamadı.",
    } as const;

    if (result !== "ok") {
      await interaction.reply({ content: messages[result], ephemeral: true });
      return;
    }

    await interaction.message.edit(buildLobbyEmbed(game));
    await interaction.reply({
      content: "✅ Kelime oyunu lobisine katıldın!",
      ephemeral: true,
    });
    return;
  }

  if (action === "start") {
    if (!game) {
      await interaction.reply({
        content: "❌ Oyun bulunamadı.",
        ephemeral: true,
      });
      return;
    }

    const result = startGame(channelId, userId);
    if (result === "not_host") {
      await interaction.reply({
        content: "❌ Oyunu yalnızca lobi sahibi başlatabilir.",
        ephemeral: true,
      });
      return;
    }
    if (result === "too_few") {
      await interaction.reply({
        content: "❌ Oyunu başlatmak için en az 2 oyuncu gerekli.",
        ephemeral: true,
      });
      return;
    }
    if (result !== "ok") {
      await interaction.reply({
        content: "❌ Oyun bulunamadı.",
        ephemeral: true,
      });
      return;
    }

    await interaction.message.edit(buildGameEmbed(game));
    await interaction.reply({
      content: `✅ Oyun başladı! İlk sıra **${currentPlayer(game).username}** kullanıcısında.`,
      ephemeral: true,
    });
    return;
  }

  if (action === "write") {
    if (!game || game.phase !== "playing") {
      await interaction.reply({
        content: "❌ Şu anda kelime yazılabilecek aktif bir oyun yok.",
        ephemeral: true,
      });
      return;
    }

    if (currentPlayer(game).userId !== userId) {
      await interaction.reply({
        content: `❌ Şu an sıra **${currentPlayer(game).username}** kullanıcısında.`,
        ephemeral: true,
      });
      return;
    }

    const requiredLetter = game.currentWord
      .at(-1)
      ?.toLocaleUpperCase("tr-TR");
    const input = new TextInputBuilder()
      .setCustomId("kelime")
      .setLabel(`${requiredLetter} harfiyle başlayan kelime`)
      .setPlaceholder("Örnek: masa")
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(24)
      .setRequired(true);

    const modal = new ModalBuilder()
      .setCustomId("kelime:submit")
      .setTitle("Kelime Türetme")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );

    await interaction.showModal(modal);
  }
}

async function handleKelimeSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const game = getGame(channelId);
  if (!game) {
    await interaction.reply({
      content: "❌ Bu kanalda aktif bir kelime oyunu yok.",
      ephemeral: true,
    });
    return;
  }

  const result = submitWord(
    channelId,
    interaction.user.id,
    interaction.fields.getTextInputValue("kelime"),
  );
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: result.winner
      ? `🎉 Tebrikler! **${result.word}** ile ${result.points} puan aldın ve oyunu kazandın!`
      : `✅ **${result.word}** kabul edildi. +${result.points} puan!`,
    ephemeral: true,
  });

  await refreshGameMessage(interaction, channelId, game.lastMessageId);
  if (result.winner) endGame(channelId);
}

export async function handleKelimeInteraction(
  interaction: Interaction,
): Promise<void> {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("kelime:")) {
      await handleKelimeButton(interaction);
      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "kelime:submit"
    ) {
      await handleKelimeSubmit(interaction);
    }
  } catch (err) {
    logger.error({ err }, "Kelime handler hatası");
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction
        .reply({ content: "❌ Bir hata oluştu.", ephemeral: true })
        .catch(() => null);
    }
  }
}