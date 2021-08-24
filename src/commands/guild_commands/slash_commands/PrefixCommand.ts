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
import DatabaseGuildManager from "../../../DatabaseGuildManager";
import DatabaseManager from "../../../DatabaseManager";
import {
  GroupPermission,
  groupPermissions,
  reverseGroupPermissions,
} from "../../../db/models/Guild";
import SoundManager from "../../../SoundManager";
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
import AudioManager from "../../../AudioManager";

const dbManager = DatabaseManager.getInstance();
const deleter = MessageDeleter.getInstance();

export default class PrefixCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _prefixCommands: Map<Guild, PrefixCommand> = new Map();
  guild: Guild;
  name: string = "prefix";
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
        observer.onPermissionsChange(this, permissions)
      )
    );
  }

  public static getInstance(guild: Guild): PrefixCommand {
    if (PrefixCommand._prefixCommands.has(guild)) {
      return PrefixCommand._prefixCommands.get(guild);
    }
    const instance = new PrefixCommand(guild);
    PrefixCommand._prefixCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.MANAGE_GUILD_SETTINGS;
    const templateDbGuild = await dbManager.getGuild({
      discordId: this.guild.id,
    });
    return {
      name: this.name,
      description:
        'Change the command prefix for sound commands of the bot. (All other commands are fixed to **"/"**)',
      forOwner: true,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        const permissionGroups = templateDbGuild.permissionGroups.map(
          (group) => ({
            name: group.name,
            value: group.id,
          })
        );
        return {
          name: this.name,
          description: "Change the command prefix",
          defaultPermission: this.defaultPermission,
          options: [
            {
              name: "prefix",
              description: "The new Prefix",
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
          handler: async (interaction: CommandInteraction) => {
            interaction.deferReply({ ephemeral: true });
            const newPrefix = interaction.options.getString("prefix");
            const guild = interaction.guild;
            const dbGuild = await dbManager.getGuild({
              discordId: guild.id,
            });
            const member = interaction.member as GuildMember;
            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!(await dbGuildManager.canManageGuildSettings(member))) {
              interaction.followUp({
                content: "You don't have the permission to change the prefix",
                ephemeral: true,
              });
              return;
            }

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
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
