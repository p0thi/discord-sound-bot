import { hyperlink } from "@discordjs/builders";
import {
  ApplicationCommand,
  ApplicationCommandPermissionData,
  ApplicationCommandPermissions,
  ApplicationCommandPermissionsManager,
  Collection,
  Guild,
  GuildApplicationCommandPermissionData,
  Snowflake,
} from "discord.js";
import ContextMenuCommandCreator, {
  ContextMenuCommandTemplate,
} from "../commands/ContextMenuCommandCreator";
import CustomApplicationCommand from "../commands/CustomApplicationCommand";
import IGuildSlashCommand, {
  IGuildContextMenuCommand,
} from "../commands/guild_commands/IGuildCommand";
import IGuildCommandObserver from "../commands/guild_commands/IGuildCommandObserver";
import IPermissionChangeObserver from "../commands/guild_commands/IPermissionChangeObserver";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import { GroupPermission } from "../db/models/Guild";
import log from "../log";
import SlashCommandManager from "./SlashCommandManager";
import { REST } from "@discordjs/rest";
// const { REST } = require("@discordjs/rest");
import { Routes } from "discord-api-types/v9";
// const { Routes } = require("discord-api-types/v9");

type Template = SlashCommandTemplate | ContextMenuCommandTemplate;

export default abstract class ACommandManager
  implements IGuildCommandObserver, IPermissionChangeObserver
{
  async commandChangeObserved(
    target: IGuildSlashCommand | IGuildContextMenuCommand
  ) {
    const template = await target.generateTemplate();
    const guildCommand = target.guild.commands.cache.find(
      (i) => i.name === template.name
    );
    const customCommand = template.create();
    // customCommand.permissions?.add({
    //   permissions: await CustomApplicationCommand.getPermissions(
    //     customCommand.guild.id,
    //     customCommand.permission
    //   ),
    // });
    await target.guild.commands
      .edit(guildCommand, customCommand.apiCommand.toJSON())
      .catch((e) => {
        log.error(`Could not edit command ${guildCommand.name}`);
      });
  }

  async onPermissionsChange(
    guild: Guild,
    permission: GroupPermission[]
  ): Promise<Collection<string, ApplicationCommandPermissions[]>> {
    const result = await ACommandManager.editGuildCommandsPermissions(
      guild
    ).catch();
    return result;
  }

  abstract getTemplates(): Promise<Map<Guild, Template[]>>;

  static async setGuildCommands(guild: Guild, ...managers: ACommandManager[]) {
    await guild.client.guilds.fetch();
    const templates: Map<Guild, Template[]> = new Map();
    for (const manager of managers) {
      const currentTemplates = await manager.getTemplates().catch((e) => {
        return new Map<Guild, Template[]>();
      });

      for (const [guild, guildTemplates] of currentTemplates) {
        if (!templates.has(guild)) {
          templates.set(guild, []);
        }
        templates.get(guild).push(...guildTemplates);
      }
    }

    const guildTemplates = templates.get(guild);

    if (!guildTemplates) {
      return;
    }

    const customGuildCommands = guildTemplates.map((c) =>
      c.create().apiCommand.toJSON()
    );

    const rest = new REST({ version: "9" }).setToken(guild.client.token);

    const setCommands = await rest
      .put(Routes.applicationGuildCommands(guild.client.user.id, guild.id), {
        body: customGuildCommands,
      })
      .catch((e) => console.log("EEEEEEEEEEEEEEEEEEEE"));

    if (!setCommands) {
      return;
    }

    const receivedResponse = setCommands as { id: string; name: string }[];

    // const setCommands = await guild.commands
    //   .set(customGuildCommands)
    //   .catch(async (e) => {
    //     const owner = await guild.members
    //       .fetch(guild.ownerId)
    //       .catch((e) => console.log(e));
    //     if (!owner) {
    //       console.log("Owner not found");
    //       return;
    //     }
    //     log.error(
    //       `Could not set guild commands on ${guild.name} [${guild.id}]`
    //     );
    //     log.error(e.message);
    //     log.info(
    //       `Guild owner: ${owner.displayName} aka ${owner.user.username} [${guild.ownerId}]`
    //     );
    //     guild.members.fetch(guild.ownerId).then((owner) => {
    //       owner.createDM().then((dm) => {
    //         dm.send(
    //           `I need further permissions to function properly. Please invite me to the server **${guild.name}** (<https://discord.com/channels/${guild.id}>) again using the following link:\n\nhttps://discord.com/api/oauth2/authorize?client_id=${guild.client.user.id}&permissions=36510493760&redirect_uri=http%3A%2F%2Flocalhost&scope=applications.commands%20bot`
    //         ).then((m) => guild.leave());
    //       });
    //     });
    //   });

    guild.commands.permissions.set({
      fullPermissions: (await Promise.all(
        receivedResponse.map(
          async (c) =>
            ({
              id: c.id as Snowflake,
              permissions:
                await ACommandManager.getPermissionForTemplateAndGuild(
                  guildTemplates.find((i) => i.name === c.name),
                  guild
                ),
            } as GuildApplicationCommandPermissionData)
        )
      ).catch((e) => {
        console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
        return [];
      })) as GuildApplicationCommandPermissionData[],
    });
  }

  static async editGuildCommandsPermissions(
    guild: Guild
  ): Promise<Collection<string, ApplicationCommandPermissions[]>> {
    const [guildCommands, guildCommandPermissions] = await Promise.all([
      guild.commands.fetch(),
      guild.commands.permissions.fetch({}),
    ]);

    const templates = await Promise.all(
      [
        ...(await SlashCommandCreator.getAllGuildSlashCommands(guild)),
        ...(await ContextMenuCommandCreator.getAllGuildContextMenuCommands(
          guild
        )),
      ]
        .map((c) => c.generateTemplate())
        .filter((t) => !!t)
    );

    const result = await guild.commands.permissions
      .set({
        fullPermissions: await Promise.all(
          guildCommands.map(async (c) => {
            return {
              id: c.id as Snowflake,
              permissions:
                await ACommandManager.getPermissionForTemplateAndGuild(
                  templates.find((t) => t.name === c.name),
                  guild
                ),
            };
          })
        ),
      })
      .catch((e) => {
        log.error(
          `Could not set permissions for commands: ${guildCommands
            .map((t) => t.name)
            .join(", ")}`
        );
      });
    return result || undefined;
  }

  static async getPermissionForTemplateAndGuild(
    template: Template,
    guild: Guild
  ): Promise<ApplicationCommandPermissionData[]> {
    return [
      {
        id: process.env.BOT_OWNER,
        type: "USER",
        permission: true,
      } as ApplicationCommandPermissionData,
      ...(template.forOwner
        ? [
            {
              id: guild.ownerId,
              type: "USER",
              permission: true,
            } as ApplicationCommandPermissionData,
          ]
        : []),
      ...(await CustomApplicationCommand.getPermissions(
        guild.id,
        template.permission
      )),
    ] as ApplicationCommandPermissionData[];
  }
}
