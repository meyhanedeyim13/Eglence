import {
  Client,
  ChannelType,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Collection,
} from "discord.js";
import { logger } from "../lib/logger";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

export async function registerCommands(clientId: string, token: string) {
  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Rol seçim embed'ini bu kanala gönder (Sadece yöneticiler)")
      .addStringOption((opt) =>
        opt
          .setName("tür")
          .setDescription("Hangi rol kategorisi?")
          .setRequired(true)
          .addChoices(
            { name: "♈ Burç Rolleri", value: "burc" },
            { name: "💞 İlişki Durumu Rolleri", value: "iliski" },
            { name: "⚽ Takım Rolleri", value: "takim" },
            { name: "🎨 Renk Rolleri", value: "renk" },
            { name: "🎟️ Katılım Rolleri", value: "katilim" },
          ),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("uno")
      .setDescription("Bu kanalda yeni bir UNO oyunu başlat")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("vampir")
      .setDescription("Bu kanalda yeni bir Vampir Köylü oyunu başlat")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("kelime")
      .setDescription("Bu kanalda Türkçe Kelime Türetme durumunu göster")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("kelime-kur")
      .setDescription("Yöneticinin kelime oyun kanalını belirlemesi")
      .addChannelOption((opt) =>
        opt
          .setName("kanal")
          .setDescription("Kelime oyununun oynanacağı yazı kanalı")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .toJSON(),
  ];

  const rest = new REST().setToken(token);
  logger.info("Slash komutları kaydediliyor...");
  const guildId = process.env["DISCORD_GUILD_ID"];
  const commandRoute = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(commandRoute, { body: commands });
  logger.info("Slash komutları başarıyla kaydedildi.");
}

export const commandHandlers = new Collection<string, unknown>();
