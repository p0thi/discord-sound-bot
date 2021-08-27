import { Client, Guild } from "discord.js";
import ContextMenuCommandCreator from "../commands/ContextMenuCommandCreator";
import SlashCommandCreator from "../commands/SlashCommandCreator";
import IGuild from "../db/interfaces/IGuild";
import ACommandManager from "./ACommandManager";
import ContextMenuCommandManager from "./ContextMenuCommandManager";
import DatabaseManager from "./DatabaseManager";
import SlashCommandManager from "./SlashCommandManager";

const dbManager = DatabaseManager.getInstance();

export default class BotGuildManager {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }

  static async setupGuild(bot: Client, guild: Guild): Promise<void> {
    await ACommandManager.setGuildCommands(
      guild,
      SlashCommandManager.getInstance(bot),
      ContextMenuCommandManager.getInstance(bot)
    );
  }

  start(): void {
    this.bot.on("guildCreate", this.onGuildCreate);
    this.bot.on("guildDelete", this.onGuildDelete);

    // making sure every guild is in the database
    this.bot.guilds.cache.forEach((guild) => {
      BotGuildManager.setupGuild(this.bot, guild).catch((e) => console.log(e));
    });
  }

  private onGuildCreate(guild: Guild): void {
    BotGuildManager.setupGuild(this.bot, guild);
  }

  private onGuildDelete(guild: Guild): void {}
}
