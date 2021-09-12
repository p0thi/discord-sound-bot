import {
  ButtonInteraction,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageOptions,
  SelectMenuInteraction,
  VoiceChannel,
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
import { v1 as uuid } from "uuid";
import request from "http-async";
import IPermissionChangeObserver from "../IPermissionChangeObserver";
import log from "../../../log";
import { GroupPermissionKey } from "../../../db/interfaces/IGuild";
import Conversation from "../../../Conversation";
import MessageDeleter from "../../../MessageDeleter";
import { codeBlock } from "@discordjs/builders";
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";

const dbManager = DatabaseManager.getInstance();
const deleter = MessageDeleter.getInstance();

export default class SettingsCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _settingsCommands: Map<Guild, SettingsCommand> = new Map();
  guild: Guild;
  name: string = "settings";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;

  private _permissionObservers: IPermissionChangeObserver[] = [];
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  addPermissionObserver(observer: IPermissionChangeObserver): void {
    throw new Error("Method not implemented.");
  }

  async notifyPermissionObservers(permissions: GroupPermission[]) {
    await Promise.all(
      this._permissionObservers.map((observer) =>
        observer.onPermissionsChange(this.guild, permissions)
      )
    );
  }

  public static getInstance(guild: Guild): SettingsCommand {
    if (SettingsCommand._settingsCommands.has(guild)) {
      return SettingsCommand._settingsCommands.get(guild);
    }
    const instance = new SettingsCommand(guild);
    SettingsCommand._settingsCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.MANAGE_GUILD_SETTINGS;
    return {
      name: this.name,
      description: "Change the settings of the server.",
      forOwner: true,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        return {
          name: this.name,
          description: "Change the server settings",
          defaultPermission: this.defaultPermission,
          options: [
            {
              name: "prefix",
              description: "Change the server command prefix",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "prefix",
                  description: "The new command prefix",
                  required: true,
                  type: "STRING",
                  choices: [
                    "!",
                    "#",
                    "+",
                    "-",
                    "$",
                    "§",
                    "%",
                    "&",
                    ")",
                    ")",
                    "=",
                    "?",
                    "`",
                    "'",
                    "|",
                    "[",
                    "]",
                    "^",
                    ":",
                    ";",
                  ].map((prefix) => ({ name: prefix, value: prefix })),
                },
              ],
            },
            {
              name: "volume",
              description: "Change the server sound volume multyplier",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "volume",
                  description: "The new sound volume",
                  required: true,
                  type: "NUMBER",
                },
              ],
            },
          ],
          handler: async (interaction: CommandInteraction) => {
            interaction.deferReply({ ephemeral: true });
            const subCommand = interaction.options.getSubcommand();
            const guild = interaction.guild;
            const dbGuild = await dbManager.getGuild({
              discordId: guild.id,
            });
            const member = interaction.member as GuildMember;
            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!(await dbGuildManager.canManageGuildSettings(member))) {
              interaction.followUp({
                content: "You don't have the permission to change the settings",
                ephemeral: true,
              });
              return;
            }

            switch (subCommand) {
              case "prefix":
                {
                  const newPrefix = interaction.options.getString("prefix");

                  if (newPrefix.length !== 1) {
                    interaction.followUp({
                      content: "The prefix must be one character long",
                      ephemeral: true,
                    });
                    return;
                  }
                  dbGuild.commandPrefix = newPrefix;
                  await dbGuild.save();

                  interaction.followUp({
                    content: `The prefix has been changed to **${newPrefix}**`,
                    ephemeral: true,
                  });
                }
                break;
              case "volume":
                {
                  const volume = interaction.options.getNumber("volume");

                  if (volume < 0 || volume > 5) {
                    interaction.followUp({
                      content: "The volume must be between 0.0 and 5.0",
                      ephemeral: true,
                    });
                    return;
                  }

                  dbGuild.soundVolume = volume;
                  await dbGuild.save();

                  interaction.followUp({
                    content: `The volume has been changed to **${volume}**`,
                    ephemeral: true,
                  });
                }
                break;
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
