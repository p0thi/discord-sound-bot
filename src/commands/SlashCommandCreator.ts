import {
  ApplicationCommandPermissionData,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageOptions,
  MessagePayload,
  SelectMenuInteraction,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { v1 as uuidv1 } from "uuid";
import IGuildSlashCommand from "./guild_commands/IGuildCommand";
import SoundCommand from "./guild_commands/slash_commands/SoundCommand";
import DatabaseManager from "../DatabaseManager";
import { GroupPermission, groupPermissions } from "../db/models/Guild";
import PermissionGroupCommand from "./guild_commands/slash_commands/PermissionGroupCommand";
import PrefixCommand from "./guild_commands/slash_commands/PrefixCommand";
import { hyperlink, SlashCommandBuilder } from "@discordjs/builders";
import AudioManager from "../AudioManager";
import DatabaseGuildManager from "../DatabaseGuildManager";
import MultiPageMessage, {
  MultiPageMessageOfFieldsOptions,
} from "../MultiPageMessage";
import MessageDeleter from "../MessageDeleter";
import SoundManager from "../SoundManager";
import CustomApplicationCommand, {
  GlobalApplicationCommand,
} from "./CustomApplicationCommand";
import CommandsCommand from "./guild_commands/slash_commands/CommandsCommand";
import HelpCommand from "./guild_commands/slash_commands/HelpCommand";
import JoinSoundCommand from "./guild_commands/slash_commands/JoinSoundCommand";
import ContextMenuCommandCreator from "./ContextMenuCommandCreator";
import PlayCommand from "./guild_commands/slash_commands/PlayCommand";

const dbManager = DatabaseManager.getInstance();
const deleter = MessageDeleter.getInstance();

export default abstract class SlashCommandCreator {
  static globalCommands: GlobalApplicationCommand[] = [];

  static async getAllGuildSlashCommands(
    guild: Guild
  ): Promise<IGuildSlashCommand[]> {
    const commands = [
      HelpCommand.getInstance(guild),
      CommandsCommand.getInstance(guild),
      PlayCommand.getInstance(guild),
      SoundCommand.getInstance(guild),
      JoinSoundCommand.getInstance(guild),
      PermissionGroupCommand.getInstance(guild),
      PrefixCommand.getInstance(guild),
    ];
    return commands;
  }
}

export interface SlashCommandTemplate {
  name: string;
  description: string;
  permission?: GroupPermission;
  defaultPermission: boolean;
  forOwner: boolean;
  permissions?: ApplicationCommandPermissionData[];
  create: () => CustomApplicationCommand;
}
