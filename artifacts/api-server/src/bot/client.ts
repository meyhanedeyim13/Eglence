import {
  Client,
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
  ];

  const rest = new REST().setToken(token);
  logger.info("Slash komutları kaydediliyor...");
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logger.info("Slash komutları başarıyla kaydedildi.");
}

export const commandHandlers = new Collection<string, unknown>();
