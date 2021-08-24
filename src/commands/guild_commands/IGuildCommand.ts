import { Guild } from "discord.js";
import { ContextMenuCommandTemplate } from "../ContextMenuCommandCreator";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";
import IObservablePermission from "./IObservablePermission";

interface IGuildCommand extends AObservableCommand, IObservablePermission {
  guild: Guild;
  name: string;
  defaultPermission: boolean;
  canChangePermission: boolean;
}

export default interface IGuildSlashCommand extends IGuildCommand {
  generateTemplate: () => Promise<SlashCommandTemplate>;
}

export interface IGuildContextMenuCommand extends IGuildCommand {
  generateTemplate: () => Promise<ContextMenuCommandTemplate>;
}
