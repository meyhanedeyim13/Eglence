import {
  Interaction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";
import { ROLE_CATEGORIES, isMultiSelect, type CategoryKey } from "./config";
import { buildRoleEmbed } from "./embeds";

const AUTHORIZED_ROLE_ID = "1513128919182606378";

async function handleSetup(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  const hasAuthorizedRole = member.roles.cache.has(AUTHORIZED_ROLE_ID);
  const hasManageRoles = member.permissions.has(PermissionFlagsBits.ManageRoles);

  if (!hasAuthorizedRole && !hasManageRoles) {
    await interaction.reply({
      content: "❌ Bu komutu kullanmak için yetkili role sahip olman gerekiyor.",
      ephemeral: true,
    });
    return;
  }

  const category = interaction.options.getString("tür", true) as CategoryKey;
  const payload = buildRoleEmbed(category);

  await interaction.reply(payload);
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

async function handleRoleSelectMulti(interaction: StringSelectMenuInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const [, category] = interaction.customId.split(":") as [string, CategoryKey];
  const cfg = ROLE_CATEGORIES[category];
  const selectedRoleNames = interaction.values;

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

  for (const [, role] of categoryRoles) {
    if (!selectedRoleNames.includes(role.name) && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
    }
  }

  const added: string[] = [];
  for (const name of selectedRoleNames) {
    const role = guildRoles.find((r) => r.name === name);
    if (role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      added.push(name);
    }
  }

  if (selectedRoleNames.length === 0) {
    await interaction.editReply({ content: "✅ Tüm hatırlatıcı rollerin kaldırıldı." });
  } else {
    await interaction.editReply({
      content: `✅ Hatırlatıcı rollerin güncellendi:\n${selectedRoleNames.map((n) => `• **${n}**`).join("\n")}`,
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
      const [, category] = interaction.customId.split(":") as [string, CategoryKey];
      if (isMultiSelect(category)) {
        await handleRoleSelectMulti(interaction);
      } else {
        await handleRoleSelect(interaction);
      }
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
