import express from "express";
import fetch from "node-fetch";
import DatabaseManager from "../DatabaseManager";
import AuthManager from "./managers/AuthManager";
import { _sendError } from "./utils";
import log from "../log";
import IGuild, {
  GroupPermissionKey,
  IPermissionGroup,
} from "../db/interfaces/IGuild";
import { Types } from "mongoose";
import GuildModel, {
  defaultMaxDuration,
  defaultMaxSounds,
  groupPermissions,
} from "../db/models/Guild";
import DatabaseGuildManager from "../DatabaseGuildManager";
import SlashCommandCreator from "../commands/SlashCommandCreator";
import ContextMenuCommandCreator from "../commands/ContextMenuCommandCreator";
import HelpCommand, {
  LayerDescription,
} from "../commands/guild_commands/slash_commands/HelpCommand";
import IGuildSlashCommand, {
  IGuildContextMenuCommand,
} from "../commands/guild_commands/IGuildCommand";

const authManager = new AuthManager();
const dbManager = DatabaseManager.getInstance();

const router = express.Router();

router.get("/all", async (req, res) => {
  const defaultPlaceholderGuild = await req.bot.guilds.cache.first();

  const [slashCommands, contextMenuCommands] = await Promise.all([
    SlashCommandCreator.getAllGuildSlashCommands(defaultPlaceholderGuild).catch(
      () => [] as IGuildSlashCommand[]
    ),
    ContextMenuCommandCreator.getAllGuildContextMenuCommands(
      defaultPlaceholderGuild
    ).catch(() => [] as IGuildContextMenuCommand[]),
  ]);

  const [slashCommandTemplates, contextMenuCommandTemplates] =
    await Promise.all([
      Promise.all(
        slashCommands.map(async (command) => command.generateTemplate())
      ),
      Promise.all(
        contextMenuCommands.map(async (command) => command.generateTemplate())
      ),
    ]);

  //   const slashCommandTemplates = await Promise.all(
  //     slashCommands.map(async (command) => command.generateTemplate())
  //   );

  //   const contextMenuCommandTemplates = await Promise.all(
  //     contextMenuCommands.map(async (command) => command.generateTemplate())
  //   );

  const result: CommandsResponse = {
    globalSlashCommands: [
      {
        name: "help",
        description: "Displays help message",
        type: "COMMAND",
      },
      {
        name: "commands",
        description: "Displays all sound commands",
        type: "COMMAND",
        options: [
          {
            name: "search",
            description: "Only show commands containing this",
            type: "STRING",
            required: false,
          },
        ],
      },
    ],
    slashCommands: slashCommandTemplates.map((command) =>
      HelpCommand.commandToDecriptionLayer(command)
    ),
    contextMenuCommands: contextMenuCommandTemplates.map((command) =>
      HelpCommand.commandToDecriptionLayer(command)
    ),
  };

  res.status(200).json(result);
});

module.exports = router;

interface CommandsResponse {
  globalSlashCommands: LayerDescription[];
  slashCommands: LayerDescription[];
  contextMenuCommands: LayerDescription[];
}
