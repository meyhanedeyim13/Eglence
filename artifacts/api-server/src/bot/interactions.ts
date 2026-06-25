import {
  Interaction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { logger } from "../lib/logger";
import { ROLE_CATEGORIES, type CategoryKey } from "./config";
import { buildRoleEmbed } from "./embeds";

async function handleSetup(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "❌ Bu komutu kullanmak için **Rolleri Yönet** yetkisine ihtiyacın var.",
      ephemeral: true,
    });
    return;
  }

  const category = interaction.options.getString("tür", true) as CategoryKey;
  const payload = buildRoleEmbed(category);

  const channel = interaction.channel as TextChannel;
  await channel.send(payload);

  await interaction.reply({
    content: `✅ **${ROLE_CATEGORIES[category].title}** embed'i bu kanala gönderildi!`,
    ephemeral: true,
  });
}

async function handleRoleSelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const [, category] = interaction.customId.split(":") as [string, CategoryKey];
  const cfg = ROLE_CATEGORIES[category];
  const selectedRoleName = interaction.values[0];

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ Sunucu bulunamadı." });
    return;
  }

  const member = interaction.member as GuildMember;

  const allCategoryRoleNames = cfg.roles.map((r) => r.value);
  const guildRoles = await guild.roles.fetch();

  const categoryRoles = guildRoles.filter((r) =>
    (allCategoryRoleNames as readonly string[]).includes(r.name),
  );

  const selectedRole = guildRoles.find((r) => r.name === selectedRoleName);

  if (!selectedRole) {
    await interaction.editReply({
      content: `❌ **${selectedRoleName}** rolü sunucuda bulunamadı. Yöneticiye bildir.`,
    });
    return;
  }

  const alreadyHas = member.roles.cache.has(selectedRole.id);

  const toRemove = categoryRoles.filter(
    (r) => member.roles.cache.has(r.id) && r.id !== selectedRole.id,
  );

  for (const [, role] of toRemove) {
    await member.roles.remove(role);
  }

  if (alreadyHas) {
    await member.roles.remove(selectedRole);
    await interaction.editReply({
      content: `✅ **${selectedRoleName}** rolü kaldırıldı.`,
    });
  } else {
    await member.roles.add(selectedRole);
    await interaction.editReply({
      content: `✅ **${selectedRoleName}** rolü verildi!`,
    });
  }
}

export async function handleInteraction(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
      await handleSetup(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("role_select:")
    ) {
      await handleRoleSelect(interaction);
      return;
    }
  } catch (err) {
    logger.error({ err }, "Interaction handler hatası");

    const reply = { content: "❌ Bir hata oluştu. Lütfen tekrar dene.", ephemeral: true };
    if ("replied" in interaction && interaction.replied) return;
    if ("deferred" in interaction && interaction.deferred) {
      await (interaction as StringSelectMenuInteraction).editReply(reply);
    } else if ("reply" in interaction) {
      await (interaction as ChatInputCommandInteraction).reply(reply);
    }
  }
}
