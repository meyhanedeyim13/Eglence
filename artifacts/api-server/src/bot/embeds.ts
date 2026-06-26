import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { ROLE_CATEGORIES, isMultiSelect, type CategoryKey } from "./config";

export function buildRoleEmbed(category: CategoryKey) {
  const cfg = ROLE_CATEGORIES[category];
  const multi = isMultiSelect(category);

  const embed = new EmbedBuilder()
    .setTitle(cfg.title)
    .setDescription(cfg.description)
    .setColor(cfg.color)
    .setFooter({ text: "Kahvehane #80 • Rol Sistemi" })
    .setTimestamp();

  const options = cfg.roles.map((r) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(r.label)
      .setValue(r.value)
      .setEmoji(r.emoji),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`role_select:${category}`)
    .setPlaceholder(cfg.placeholder)
    .addOptions(options);

  if (multi) {
    menu.setMinValues(0).setMaxValues(options.length);
  }

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  const clearButton = new ButtonBuilder()
    .setCustomId(`clear_roles:${category}`)
    .setLabel("Seçimleri Temizle")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(clearButton);

  return { embeds: [embed], components: [selectRow, buttonRow] };
}
