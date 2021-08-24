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
  static globalCommands: GlobalApplicationCommand[] = [
    new GlobalApplicationCommand(
      new SlashCommandBuilder()
        .setName("help")
        .setDescription("Shows help message")
        .toJSON(),
      "Shows a help message for all commands",
      async (interaction: CommandInteraction) => {
        interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;

        if (!guild) {
          interaction.followUp({
            content: "This command can only be used in a server",
            ephemeral: true,
          });
          return;
        }

        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });

        const slashCommandTemplates = await Promise.all(
          (
            await SlashCommandCreator.getAllGuildSlashCommands(guild)
          ).map(async (c) => await c.generateTemplate())
        );
        const contextMenuCommandTemplates = await Promise.all(
          (
            await ContextMenuCommandCreator.getAllGuildContextMenuCommands(
              guild
            )
          ).map(async (c) => await c.generateTemplate())
        );
        const options = {
          content:
            `All commands with an explaination and information about the needed permissions to issue the command.\n` +
            `Most of all the commands functionality can be used on the website ${hyperlink(
              "sounds.pothi.eu",
              `https://sounds.pothi.eu/#/guilds?guild=${dbGuild.discordId}`
            )} :nerd:`,
          embeds: [
            {
              title: "All sound commands",
              description: `Commands, that are triggered in the chat by typing a the sever prefix "**${dbGuild.commandPrefix}**" followed by the command`,
              fields: [
                {
                  name: `${dbGuild.commandPrefix}\<sound\>`,
                  value:
                    `\`Permission needed: Yes ↣ ${groupPermissions.get(
                      GroupPermission.PLAY_SOUNDS
                    )}\`` +
                    `\nPlays the sound with the command **\<sound\>** in the users current voice channel`,
                },
                {
                  name: `${dbGuild.commandPrefix}random`,
                  value:
                    `\`Permission needed: Yes ↣ ${groupPermissions.get(
                      GroupPermission.PLAY_SOUNDS
                    )}\`` +
                    `\nPlays a random sound of the guild in the users current voice channel`,
                },
              ],
            },
            {
              title: "All slash commands",
              description:
                'Commands, that are triggered in the chat by typing a "/" followed by the command',
              fields: [
                SlashCommandCreator.globalCommands.map((c) => ({
                  name: `/${c.command.name}`,
                  value: `${c.description}`,
                })),
                ...HelpCommand.templatesToFields(slashCommandTemplates, "/"),
              ],
            },
            {
              title: "All user context menu commands",
              description:
                'Commands, that are triggered by right clicking on a user and selecting the interaction under "Apps"',
              fields: HelpCommand.templatesToFields(
                contextMenuCommandTemplates
              ),
            },
          ],
        } as MessageOptions;
        interaction.followUp(new MessagePayload(interaction, options));
      }
    ),
    new GlobalApplicationCommand(
      new SlashCommandBuilder()
        .setName("commands")
        .setDescription("List all sound commands")
        .addStringOption((search) =>
          search
            .setName("search")
            .setDescription("Only show commands containing this")
        )
        .toJSON(),
      "Shows all available sound commands of the bot",
      async (interaction: CommandInteraction) => {
        const guild = interaction.guild;

        if (!guild) {
          interaction.reply({
            content: "This command has to be used in a server",
            ephemeral: true,
          });
          return;
        }

        const search = interaction.options.getString("search");

        const [dbGuild, dbUser] = await Promise.all([
          dbManager.getGuild({ discordId: guild.id }),
          dbManager.getUser({ discordId: interaction.user.id }),
        ]);
        const dbGuildManager = new DatabaseGuildManager(dbGuild);

        if (dbGuildManager.isBanned(dbUser)) {
          interaction.reply({
            content: "You are banned from using this command",
            ephemeral: true,
          });
          return;
        }
        interaction.deferReply();

        SoundManager.sendCommandsList(
          interaction,
          interaction.channel,
          dbGuild,
          search
        );
      }
    ),
  ];

  static async getAllGuildSlashCommands(
    guild: Guild
  ): Promise<IGuildSlashCommand[]> {
    const commands = [
      SoundCommand.getInstance(guild),
      // CommandsCommand.getInstance(guild),
      JoinSoundCommand.getInstance(guild),
      PrefixCommand.getInstance(guild),
      PermissionGroupCommand.getInstance(guild),
      PlayCommand.getInstance(guild),
      // HelpCommand.getInstance(guild),
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
