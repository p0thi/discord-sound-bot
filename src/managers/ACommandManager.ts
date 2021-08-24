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
    await target.guild.commands.edit(guildCommand, customCommand).catch((e) => {
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
    const templates: Map<Guild, Template[]> = new Map();
    console.log(1);
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

    const customGuildCommands = guildTemplates.map((c) => c.create());

    const setCommands = await guild.commands
      .set(customGuildCommands)
      .catch(async (e) => {
        const owner = await guild.members
          .fetch(guild.ownerId)
          .catch((e) => console.log(e));
        if (!owner) {
          console.log("Owner not found");
          return;
        }
        log.error(
          `Could not set guild commands on ${guild.name} [${guild.id}]`
        );
        log.error(e.message);
        log.info(
          `Guild owner: ${owner.displayName} aka ${owner.user.username} [${guild.ownerId}]`
        );
        guild.members.fetch(guild.ownerId).then((owner) => {
          owner.createDM().then((dm) => {
            dm.send(
              `I need further permissions to function properly. Please invite me to the server **${guild.name}** (<https://discord.com/channels/${guild.id}>) again using the following link:\n\nhttps://discord.com/api/oauth2/authorize?client_id=${guild.client.user.id}&permissions=36510493760&redirect_uri=http%3A%2F%2Flocalhost&scope=applications.commands%20bot`
            ).then((m) => guild.leave());
          });
        });
      });

    if (!setCommands) {
      return;
    }

    guild.commands.permissions.set({
      fullPermissions: (await Promise.all(
        setCommands.map(
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
