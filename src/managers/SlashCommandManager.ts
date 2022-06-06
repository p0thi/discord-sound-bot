import {
  ApplicationCommand,
  ApplicationCommandData,
  ChatInputApplicationCommandData,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  MessageApplicationCommandData,
  UserApplicationCommandData,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import log from "../log";
import ACommandManager from "./ACommandManager";
import CustomApplicationCommand from "../commands/CustomApplicationCommand";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandTypes } from "discord.js/typings/enums";

type ContextMenuItem =
  | UserApplicationCommandData
  | MessageApplicationCommandData;

export default class SlashCommandManager extends ACommandManager {
  private static _instatnce: SlashCommandManager;
  bot: Client;

  private constructor(bot) {
    super();
    this.bot = bot;
  }

  static getInstance(bot: Client) {
    if (!SlashCommandManager._instatnce) {
      SlashCommandManager._instatnce = new SlashCommandManager(bot);
    }
    return SlashCommandManager._instatnce;
  }

  async getTemplates(): Promise<Map<Guild, SlashCommandTemplate[]>> {
    const res: Map<Guild, SlashCommandTemplate[]> = new Map();
    await Promise.allSettled(
      this.bot.guilds.cache.map(async (guild) => {
        const guildSlashCommands =
          await SlashCommandCreator.getAllGuildSlashCommands(guild);

        guildSlashCommands.forEach(async (slashCommand) => {
          slashCommand.addObserver(this);
        });

        const guildSlashCommandTemplates = await Promise.all(
          guildSlashCommands.map(async (c) => await c.generateTemplate())
        );
        res.set(guild, guildSlashCommandTemplates);
      })
    );
    return res;
  }

  async start() {
    this.bot.on("interactionCreate", this.handle);
    const rest = new REST({ version: "9" }).setToken(this.bot.token);

    // const currentGlobalCommands = await this.bot.application.commands.fetch();

    const modifiedCommands = SlashCommandCreator.globalCommands.map(
      (c) => c.command
    );

    // console.log("current commands", currentGlobalCommands);

    const result = await rest.put(
      Routes.applicationCommands(this.bot.user.id),
      {
        body: modifiedCommands,
      }
    );

    // const result = await this.bot.application.commands
    //   // .set([])
    //   // .set(modifiedCommands);
    //   .set(SlashCommandCreator.globalCommands.map((c) => c.command));

    log.info(
      "Global slash commands registered: " /* +
      result.map((c) => c.name).join(", ") */
    );

    // setTimeout(
    //   async () =>
    //     console.log("FETCH", await this.bot.application.commands.fetch()),
    //   10000
    // );
  }

  async handle(interaction: CommandInteraction) {
    if (!interaction.isCommand()) return;

    // for (const cmd of SlashCommandCreator.globalCommands) {
    //   if (interaction.commandName === cmd.name) {
    //     cmd.handler(interaction as CommandInteraction);
    //     return;
    //   }
    // }

    for (const cmd of SlashCommandCreator.globalCommands) {
      if (interaction.commandName === cmd.command.name) {
        cmd.handler(interaction as CommandInteraction);
        return;
      }
    }

    for (const cmd of await SlashCommandCreator.getAllGuildSlashCommands(
      interaction.guild
    )) {
      const template = await cmd.generateTemplate();
      if (interaction.commandName === template.name) {
        template.create().handler(interaction as CommandInteraction);
        return;
      }
    }
  }
}
