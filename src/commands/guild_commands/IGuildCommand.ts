import { Guild } from "discord.js";
import { ContextMenuCommandTemplate } from "../ContextMenuCommandCreator";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";

interface IGuildCommand extends AObservableCommand {
  guild: Guild;
  name: string;
  defaultPermission: boolean;
}

export default interface IGuildSlashCommand extends IGuildCommand {
  generateTemplate: () => Promise<SlashCommandTemplate>;
}

export interface IGuildContextMenuCommand extends IGuildCommand {
  generateTemplate: () => Promise<ContextMenuCommandTemplate>;
}
