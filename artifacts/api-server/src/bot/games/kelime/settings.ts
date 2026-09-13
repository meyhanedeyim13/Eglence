import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type KelimeSettings = Record<string, string>;

const settingsPath = join(
  process.cwd(),
  "data",
  "kelime-channels.json",
);

function loadSettings(): KelimeSettings {
  if (!existsSync(settingsPath)) return {};

  try {
    return JSON.parse(readFileSync(settingsPath, "utf8")) as KelimeSettings;
  } catch {
    return {};
  }
}

let settings = loadSettings();

function saveSettings(): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

export function getKelimeChannel(guildId: string): string | undefined {
  return settings[guildId];
}

export function setKelimeChannel(guildId: string, channelId: string): void {
  settings = { ...settings, [guildId]: channelId };
  saveSettings();
}