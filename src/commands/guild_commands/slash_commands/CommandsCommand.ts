import {
  ButtonInteraction,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageActionRow,
  MessageAttachment,
  MessageButton,
} from "discord.js";
import { GroupPermission } from "../../../db/models/Guild";
import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import IGuildSlashCommand from "../IGuildCommand";
import { v1 as uuid } from "uuid";
import request from "http-async";
import IPermissionChangeObserver from "../IPermissionChangeObserver";
import log from "../../../log";
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";
import SoundManager from "../../../managers/SoundManager";
import {
  SlashCommandBuilder,
  SlashCommandStringOption,
} from "@discordjs/builders";

const dbManager = DatabaseManager.getInstance();

export default class CommandsCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _commandsCommands: Map<Guild, CommandsCommand> = new Map();
  guild: Guild;
  name: string = "commands";
  canChangePermission: boolean = false;
  defaultPermission: boolean = true;

  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }

  public static getInstance(guild: Guild): CommandsCommand {
    if (CommandsCommand._commandsCommands.has(guild)) {
      return CommandsCommand._commandsCommands.get(guild);
    }
    const instance = new CommandsCommand(guild);
    CommandsCommand._commandsCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    return {
      name: this.name,
      description: "Shows all available sound commands of the bot",
      forOwner: false,
      defaultPermission: this.defaultPermission,
      create: (): CustomApplicationCommand => {
        return {
          apiCommand: new SlashCommandBuilder()
            .setName(this.name)
            .setDescription("List all sound commands")
            .setDefaultPermission(this.defaultPermission)
            .addStringOption(
              new SlashCommandStringOption()
                .setName("search")
                .setDescription("Only show commands containing this")
                .setRequired(false)
            ),
          handler: async (interaction: CommandInteraction) => {
            const guild = interaction.guild;

            if (!guild) {
              interaction.reply({
                content: "This command has to be used in a server",
                ephemeral: true,
              });
              return;
            }

            const search = interaction.options.getString("search");
            console.log(search);

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
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
