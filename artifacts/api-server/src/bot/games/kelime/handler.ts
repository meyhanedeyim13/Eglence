import {
  ActionRowBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ChannelType,
  GuildMember,
  Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { logger } from "../../../lib/logger";
import {
  buildGameEmbed,
  createGame,
  endGame,
  getGame,
  submitWord,
} from "./game";
import { getKelimeChannel, setKelimeChannel } from "./settings";

function canConfigure(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}

export async function handleKelimeSetupCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut yalnızca sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;
  if (!canConfigure(member)) {
    await interaction.reply({
      content: "❌ Bu ayarı yalnızca sunucu yöneticileri kullanabilir.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel("kanal", true);
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "❌ Kelime kanalı bir yazı kanalı olmalı.",
      ephemeral: true,
    });
    return;
  }

  const previousChannelId = getKelimeChannel(interaction.guild.id);
  if (previousChannelId && previousChannelId !== channel.id) {
    endGame(previousChannelId);
  }
  setKelimeChannel(interaction.guild.id, channel.id);
  const game = createGame(
    interaction.guild.id,
    channel.id,
    interaction.user.id,
  );
  const targetChannel = channel as TextChannel;
  const message = await targetChannel.send(buildGameEmbed(game));
  game.lastMessageId = message.id;

  await interaction.reply({
    content: `✅ Kelime oyunu yalnızca <#${channel.id}> kanalında aktif edildi. Oyuncu sınırı yoktur.`,
    ephemeral: true,
  });
}

export async function handleKelimeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut yalnızca sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  const configuredChannelId = getKelimeChannel(interaction.guild.id);
  if (!configuredChannelId) {
    await interaction.reply({
      content: "❌ Kelime kanalı henüz ayarlanmadı. Yönetici `/kelime-kur kanal:#kanal` kullanmalı.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.channelId !== configuredChannelId) {
    await interaction.reply({
      content: `❌ Kelime oyunu yalnızca <#${configuredChannelId}> kanalında kullanılabilir.`,
      ephemeral: true,
    });
    return;
  }

  const game = getGame(configuredChannelId);
  if (!game) {
    await interaction.reply({
      content: "❌ Kelime oyunu mesajı bulunamadı. Yönetici `/kelime-kur` komutuyla kanalı yeniden kurmalı.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "✅ Bu kanaldaki herkes **Kelime Yaz** butonuyla sınırsız olarak oynayabilir.",
    ephemeral: true,
  });
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

  const message = await (channel as TextChannel).messages
    .fetch(messageId)
    .catch(() => null);
  const game = getGame(channelId);
  if (message && game) await message.edit(buildGameEmbed(game));
}

async function handleKelimeButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (
    !interaction.guild ||
    getKelimeChannel(interaction.guild.id) !== interaction.channelId
  ) {
    await interaction.reply({
      content: "❌ Kelime oyunu bu kanalda aktif değil.",
      ephemeral: true,
    });
    return;
  }

  const game = getGame(interaction.channelId);
  if (!game) {
    await interaction.reply({
      content: "❌ Bu kanalda aktif bir kelime oyunu yok.",
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
    .setTitle("Türkçe Kelime Türetme")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

  await interaction.showModal(modal);
}

async function handleKelimeSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (
    !interaction.guild ||
    getKelimeChannel(interaction.guild.id) !== interaction.channelId
  ) {
    await interaction.reply({
      content: "❌ Kelime oyunu bu kanalda aktif değil.",
      ephemeral: true,
    });
    return;
  }

  const game = getGame(interaction.channelId);
  if (!game) {
    await interaction.reply({
      content: "❌ Bu kanalda aktif bir kelime oyunu yok.",
      ephemeral: true,
    });
    return;
  }

  const result = submitWord(
    interaction.channelId,
    interaction.user.id,
    interaction.user.displayName,
    interaction.fields.getTextInputValue("kelime"),
  );
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: result.continuationWord
      ? `✅ **${result.word}** kabul edildi. +${result.points} puan! Toplam puanın: **${result.totalScore}**\n\n` +
        `🔄 Kelime **Ğ** ile bittiği için yeni kelime verildi: **${result.continuationWord}**\n` +
        `Sıradaki kelime **${result.continuationWord.at(-1)?.toLocaleUpperCase("tr-TR")}** harfiyle başlamalı.`
      : `✅ **${result.word}** kabul edildi. +${result.points} puan! Toplam puanın: **${result.totalScore}**`,
    ephemeral: true,
  });
  await refreshGameMessage(interaction, interaction.channelId, game.lastMessageId);
}

export async function handleKelimeInteraction(
  interaction: Interaction,
): Promise<void> {
  try {
    if (interaction.isButton() && interaction.customId === "kelime:write") {
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