import { client, registerCommands } from "./client";
import { handleInteraction } from "./interactions";
import { logger } from "../lib/logger";

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN bulunamadı, bot başlatılmıyor.");
    return;
  }

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot hazır");

    try {
      await registerCommands(c.user.id, token);
    } catch (err) {
      logger.error({ err }, "Komut kayıt hatası");
    }
  });

  client.on("interactionCreate", handleInteraction);

  client.on("error", (err) => {
    logger.error({ err }, "Discord client hatası");
  });

  await client.login(token);
}
