import { ApplicationCommandPermissionData, Guild } from "discord.js";
import { GroupPermission } from "../db/models/Guild";
import CustomApplicationCommand from "./CustomApplicationCommand";
import BanUser from "./guild_commands/context_menu_commands/BanUser";
import UnbanUser from "./guild_commands/context_menu_commands/UnbanUser";
import { IGuildContextMenuCommand } from "./guild_commands/IGuildCommand";

export default abstract class ContextMenuCommandCreator {
  static globalCommands: CustomApplicationCommand[] = [];
  static async getAllGuildContextMenuCommands(
    guild: Guild
  ): Promise<IGuildContextMenuCommand[]> {
    const commands = [BanUser.getInstance(guild), UnbanUser.getInstance(guild)];
    return commands;
  }
}

export interface ContextMenuCommandTemplate {
  name: string;
  description: string;
  permission?: GroupPermission;
  defaultPermission: boolean;
  forOwner: boolean;
  permissions?: ApplicationCommandPermissionData[];
  create: () => CustomApplicationCommand;
}
