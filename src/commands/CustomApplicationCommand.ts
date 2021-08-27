import { SlashCommandBuilder } from "@discordjs/builders";
import { APIApplicationCommandOption } from "discord-api-types/payloads/v9";
import {
  ApplicationCommand,
  ApplicationCommandOption,
  ApplicationCommandPermissionData,
  Client,
  CommandInteraction,
  ContextMenuInteraction,
  Guild,
  Snowflake,
} from "discord.js";
import { RawApplicationCommandData } from "discord.js/typings/rawDataTypes";
import { GroupPermission, groupPermissions } from "../db/models/Guild";
import DatabaseManager from "../managers/DatabaseManager";

export default class CustomApplicationCommand extends ApplicationCommand {
  handler: (
    interaction: CommandInteraction | ContextMenuInteraction
  ) => Promise<void>;
  forOwner: boolean = true;
  options: ApplicationCommandOption[] = [];
  permission: GroupPermission;

  constructor(
    client: Client,
    data: RawApplicationCommandData,
    handler: (
      Interaction: CommandInteraction | ContextMenuInteraction
    ) => Promise<void>,
    guild?: Guild,
    guildData?: Snowflake,
    forOwner: boolean = true
  ) {
    super(client, data, guild, guildData);
    this.handler = handler;
    this.forOwner = forOwner;
  }

  static async getPermissions(
    guildId: string,
    permission: GroupPermission
  ): Promise<ApplicationCommandPermissionData[]> {
    const dbGuild = await DatabaseManager.getInstance().getGuild({
      discordId: guildId,
    });

    const permGroups = dbGuild.permissionGroups.filter((permRole) =>
      permRole.permissions.includes(groupPermissions.get(permission))
    );
    const roleIds: Set<string> = new Set();
    permGroups.forEach((permGroup) =>
      permGroup.discordRoles.forEach((roleId) => roleIds.add(roleId))
    );
    const res: ApplicationCommandPermissionData[] = Array.from(roleIds).map(
      (roleId) => ({ id: roleId, type: "ROLE", permission: true })
    );

    return res;
  }
}

type command = {
  name: string;
  description: string;
  options: APIApplicationCommandOption[];
};

export class GlobalApplicationCommand {
  command: command;
  description: string;
  handler: (
    interaction: CommandInteraction | ContextMenuInteraction
  ) => Promise<void>;

  constructor(
    command: command,
    description: string,
    handler: (
      interaction: CommandInteraction | ContextMenuInteraction
    ) => Promise<void>
  ) {
    this.command = command;
    this.description = description;
    this.handler = handler;
  }
}
