import {
  CommandInteraction,
  Guild,
  GuildMember,
  MessageEmbed,
  MessageOptions,
  MessagePayload,
} from "discord.js";
import {
  GroupPermission,
  groupPermissions,
  reverseGroupPermissions,
} from "../../../db/models/Guild";
import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import IGuildSlashCommand from "../IGuildCommand";
import IPermissionChangeObserver from "../IPermissionChangeObserver";
import log from "../../../log";
import { GroupPermissionKey } from "../../../db/interfaces/IGuild";
import {
  codeBlock,
  roleMention,
  SlashCommandBuilder,
  SlashCommandIntegerOption,
  SlashCommandRoleOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from "@discordjs/builders";
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";

const dbManager = DatabaseManager.getInstance();

export default class PermissionGroupCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _permissionGroupCommands: Map<Guild, PermissionGroupCommand> =
    new Map();
  guild: Guild;
  name: string = "group";
  canChangePermission: boolean = true;
  defaultPermission: boolean = false;

  private _permissionObservers: IPermissionChangeObserver[] = [];
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }

  public static getInstance(guild: Guild): PermissionGroupCommand {
    if (PermissionGroupCommand._permissionGroupCommands.has(guild)) {
      return PermissionGroupCommand._permissionGroupCommands.get(guild);
    }
    const instance = new PermissionGroupCommand(guild);
    PermissionGroupCommand._permissionGroupCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.MANAGE_GROUPS;
    const templateDbGuild = await dbManager.getGuild({
      discordId: this.guild.id,
    });
    return {
      name: this.name,
      description:
        "Allows to manage the permission groups for a server.\nCreate/modify/delete groups to give users different permissions.",
      forOwner: true,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        const permissionGroups = templateDbGuild.permissionGroups.map<
          [string, string]
        >((group) => [group.name, group.id]);
        const apiCommand = new SlashCommandBuilder()
          .setName(this.name)
          .setDescription("Manage permission groups")
          .setDefaultPermission(this.defaultPermission)
          .addSubcommand(
            new SlashCommandSubcommandBuilder()
              .setName("create")
              .setDescription("Create a new permission group")
              .addStringOption(
                new SlashCommandStringOption()
                  .setName("name")
                  .setDescription("The name of the group")
                  .setRequired(true)
              )
              .addIntegerOption(
                new SlashCommandIntegerOption()
                  .setName("sound_duration")
                  .setDescription("Max duration of added sounds")
                  .setRequired(true)
              )
              .addIntegerOption(
                new SlashCommandIntegerOption()
                  .setName("sound_amound")
                  .setDescription("Max amount of sounds per user")
                  .setRequired(true)
              )
          )
          .addSubcommand(
            new SlashCommandSubcommandBuilder()
              .setName("list")
              .setDescription("List all permission groups")
          );
        if (permissionGroups.length > 0) {
          apiCommand.addSubcommand(
            new SlashCommandSubcommandBuilder()
              .setName("delete")
              .setDescription("Delete a permission group")
              .addStringOption(
                new SlashCommandStringOption()
                  .setName("group")
                  .setDescription("A group")
                  .setRequired(true)
                  .addChoices(permissionGroups)
              )
          );
          apiCommand.addSubcommandGroup(
            new SlashCommandSubcommandGroupBuilder()
              .setName("add")
              .setDescription("Add settings to the group")
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("permission")
                  .setDescription("Add a permission to the group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addStringOption(
                    new SlashCommandStringOption()

                      .setName("permission")
                      .setDescription("A permission")
                      .setRequired(true)
                      .addChoices(
                        Object.keys(GroupPermission).map((key) => [key, key])
                      )
                  )
              )
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("role")
                  .setDescription("Add a role to the group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addRoleOption(
                    new SlashCommandRoleOption()
                      .setName("role")
                      .setDescription("A role")
                      .setRequired(true)
                  )
              )
          );
          apiCommand.addSubcommandGroup(
            new SlashCommandSubcommandGroupBuilder()
              .setName("remove")
              .setDescription("Remove settings from the group")
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("permission")
                  .setDescription("Remove a permission from the group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("permission")
                      .setDescription("A permission")
                      .setRequired(true)
                      .addChoices(
                        Object.keys(GroupPermission).map((key) => [key, key])
                      )
                  )
              )
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("role")
                  .setDescription("Remove a role from the group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addRoleOption(
                    new SlashCommandRoleOption()
                      .setName("role")
                      .setDescription("A role")
                      .setRequired(true)
                  )
              )
          );
          apiCommand.addSubcommandGroup(
            new SlashCommandSubcommandGroupBuilder()
              .setName("edit")
              .setDescription("Edit group settings")
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("name")
                  .setDescription("Edit name of a group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("name")
                      .setDescription("The new name")
                      .setRequired(true)
                  )
              )
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("sound_duration")
                  .setDescription("Edit sound max duration of a group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addIntegerOption(
                    new SlashCommandIntegerOption()
                      .setName("duration")
                      .setDescription("The new max duration")
                      .setRequired(true)
                  )
              )
              .addSubcommand(
                new SlashCommandSubcommandBuilder()
                  .setName("sound_amount")
                  .setDescription("Edit sound max amount of a group")
                  .addStringOption(
                    new SlashCommandStringOption()
                      .setName("group")
                      .setDescription("A group")
                      .setRequired(true)
                      .addChoices(permissionGroups)
                  )
                  .addIntegerOption(
                    new SlashCommandIntegerOption()
                      .setName("amount")
                      .setDescription("The new max amount")
                      .setRequired(true)
                  )
              )
          );
        }
        return {
          apiCommand,
          handler: async (interaction: CommandInteraction) => {
            interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;

            const [dbGuild, dbUser] = await Promise.all([
              dbManager.getGuild({ discordId: guild.id }),
              dbManager.getUser({ discordId: interaction.user.id }),
            ]);

            const member = interaction.member as GuildMember;
            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!(await dbGuildManager.canManageGroups(member))) {
              interaction.followUp({
                content: `You don't have permission to manage groups in this server`,
                ephemeral: true,
              });
              return;
            }
            let subCommandGroup = interaction.options.getSubcommandGroup(false);
            const subCommand = interaction.options.getSubcommand(false);

            switch (subCommandGroup) {
              case "add":
                {
                  switch (subCommand) {
                    case "role":
                      {
                        const groupId = interaction.options.getString("group");
                        const role = interaction.options.getRole("role");
                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }
                        if (group.discordRoles.includes(role.id)) {
                          interaction.followUp({
                            content: `The role ${role.name} is already in the group ${group.name}`,
                            ephemeral: true,
                          });
                          return;
                        }

                        group.discordRoles.push(role.id);
                        await group.ownerDocument().save();


                        interaction.followUp({
                          content: `The role ${role.name} has been added to the group ${group.name}`,
                          ephemeral: true,
                        });
                      }
                      break;
                    case "permission":
                      {
                        const groupId = interaction.options.getString("group");
                        const permission = interaction.options.getString(
                          "permission"
                        ) as GroupPermissionKey;

                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group ${groupId} does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }

                        if (group.permissions.includes(permission)) {
                          interaction.followUp({
                            content: `The permission ${permission} is already in the group ${group.name}`,
                            ephemeral: true,
                          });
                          return;
                        }

                        group.permissions.push(permission);
                        await group.ownerDocument().save();

                        interaction.followUp({
                          content: `The permission ${permission} has been added to the group ${group.name}`,
                          ephemeral: true,
                        });
                      }
                      break;
                  }
                }
                break;
              case "remove":
                {
                  switch (subCommand) {
                    case "role":
                      {
                        const groupId = interaction.options.getString("group");
                        const role = interaction.options.getRole("role");
                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }
                        if (!group.discordRoles.includes(role.id)) {
                          interaction.followUp({
                            content: `The role ${role.name} is not in the group ${group.name}`,
                            ephemeral: true,
                          });
                          return;
                        }

                        group.discordRoles.splice(
                          group.discordRoles.indexOf(role.id),
                          1
                        );
                        await group.ownerDocument().save();

                        interaction.followUp({
                          content: `The role ${role.name} has been removed from the group ${group.name}`,
                          ephemeral: true,
                        });
                      }
                      break;
                    case "permission":
                      {
                        const groupId = interaction.options.getString("group");
                        const permission = interaction.options.getString(
                          "permission"
                        ) as GroupPermissionKey;

                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group ${groupId} does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }

                        if (!group.permissions.includes(permission)) {
                          interaction.followUp({
                            content: `The permission ${permission} is not in the group ${group.name}`,
                            ephemeral: true,
                          });
                          return;
                        }

                        group.permissions.splice(
                          group.permissions.indexOf(permission),
                          1
                        );
                        await group.ownerDocument().save();

                        interaction.followUp({
                          content: `The permission ${permission} has been removed from the group ${group.name}`,
                          ephemeral: true,
                        });
                      }
                      break;
                  }
                }
                break;
              case "edit":
                {
                  switch (subCommand) {
                    case "name":
                      {
                        const groupId = interaction.options.getString("group");
                        const name = interaction.options.getString("name");
                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }

                        const oldName = group.name;

                        group.name = name;
                        await group.ownerDocument().save();
                        await this.notifyObservers();
                        interaction.followUp({
                          content: `The group ${oldName} has been renamed to ${name}`,
                          ephemeral: true,
                        });
                      }
                      break;
                    case "sound_duration":
                      {
                        const groupId = interaction.options.getString("group");
                        const duration =
                          interaction.options.getInteger("duration");
                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }
                        if (duration < 0) {
                          interaction.followUp({
                            content: `The duration must be a positive integer`,
                            ephemeral: true,
                          });
                          return;
                        }

                        const oldDuration = group.maxSoundDuration;
                        group.maxSoundDuration = duration;
                        await group.ownerDocument().save();
                        interaction.followUp({
                          content: `The duration has been changed from ${oldDuration} to ${duration}`,
                          ephemeral: true,
                        });
                      }
                      break;
                    case "sound_amount":
                      {
                        const groupId = interaction.options.getString("group");
                        const amount = interaction.options.getInteger("amount");
                        const group = dbGuild.permissionGroups.id(groupId);

                        if (!group) {
                          interaction.followUp({
                            content: `The group does not exist`,
                            ephemeral: true,
                          });
                          return;
                        }

                        if (amount < 0) {
                          interaction.followUp({
                            content: `The amount must be a positive integer`,
                            ephemeral: true,
                          });
                          return;
                        }
                        const oldAmount = group.maxSoundsPerUser;
                        group.maxSoundsPerUser = amount;
                        await group.ownerDocument().save();
                        interaction.followUp({
                          content: `The max sound amount per user has been changed from ${oldAmount} to ${amount}`,
                          ephemeral: true,
                        });
                      }
                      break;
                  }
                }
                break;
              default: {
                switch (subCommand) {
                  case "list":
                    {
                      const options = {
                        embeds: [
                          {
                            title: `${member.displayName}'s Permissions`,
                            fields: [
                              {
                                name: "Max sounds",
                                value: `${
                                  dbGuildManager.getMaxSoundsPerUser(member) ||
                                  0
                                }`,
                                inline: true,
                              },
                              {
                                name: "Max sound duration",
                                value: `${
                                  dbGuildManager.getMaxSoundDurationForMember(
                                    member
                                  ) || 0
                                } seconds`,
                                inline: true,
                              },
                              {
                                name: "Permissions",
                                value: `${
                                  dbGuildManager
                                    .getMemberGroupPermissions(member)
                                    .map((p) => groupPermissions.get(p))
                                    .join(", ") || "None"
                                }`,
                              },
                            ],
                          },
                          ...dbGuild.permissionGroups.map((group) => {
                            const maxPermissionKeyLength = Math.max(
                              ...Object.keys(GroupPermission).map(
                                (p) => p.length
                              )
                            );
                            return {
                              title: group.name,
                              fields: [
                                {
                                  name: "Max sounds per user",
                                  value: `${Math.min(
                                    group.maxSoundsPerUser,
                                    dbGuild.maxSounds
                                  )}`,
                                  inline: true,
                                },
                                {
                                  name: "Max sound duration of new sounds",
                                  value: `${Math.min(
                                    group.maxSoundDuration,
                                    dbGuild.maxSoundDuration
                                  )} seconds`,
                                  inline: true,
                                },
                                {
                                  name: "Roles",
                                  value:
                                    group.discordRoles.length > 0
                                      ? group.discordRoles
                                          .map((role) => roleMention(role))
                                          .filter((r) => !!r)
                                          .join(", ")
                                      : "None",
                                },
                                {
                                  name: "Permissions",
                                  value: codeBlock(
                                    "js",
                                    group.permissions.length > 0
                                      ? group.permissions
                                          .map(
                                            (permission) =>
                                              `"${permission}":${" ".repeat(
                                                3 +
                                                  maxPermissionKeyLength -
                                                  permission.length
                                              )}${reverseGroupPermissions.get(
                                                permission
                                              )}`
                                          )
                                          .join("\n\n")
                                      : "None"
                                  ),
                                },
                              ],
                            } as MessageEmbed;
                          }),
                        ],
                      } as MessageOptions;

                      interaction
                        .followUp(new MessagePayload(interaction, options))
                        .catch((e) => {
                          log.error("Could not send permissions list");
                          console.log(e);
                        });
                    }
                    break;
                  case "create":
                    {
                      const name = interaction.options.getString("name");
                      const soundDuration =
                        interaction.options.getInteger("sound_duration");
                      const soundAmount =
                        interaction.options.getInteger("sound_amount");

                      dbGuild.permissionGroups.addToSet({
                        name,
                        maxSoundDuration: soundDuration,
                        maxSoundsPerUser: soundAmount,
                      });
                      await dbGuild.save().catch((e) => {
                        log.error("Could not save guild to database");
                      });
                      await this.notifyObservers();
                      interaction.followUp({
                        content: `Created group ${name}`,
                        ephemeral: true,
                      });
                    }
                    break;
                  case "delete":
                    {
                      const groupId = interaction.options.getString("group");
                      const group = dbGuild.permissionGroups.id(groupId);

                      if (!group) {
                        interaction.followUp({
                          content: `Group ${groupId} does not exist`,
                          ephemeral: true,
                        });
                        return;
                      }

                      dbGuild.permissionGroups.remove(group);
                      await dbGuild.save().catch((e) => {
                        log.error("Could not save guild to database");
                      });
                      await this.notifyObservers();

                      interaction.followUp({
                        content: `Deleted group ${group.name}`,
                        ephemeral: true,
                      });
                    }
                    break;
                }
              }
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
