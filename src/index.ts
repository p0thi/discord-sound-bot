// https://discord.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
require("dotenv").config();
import MessageHandler from "./MessageHandler";
import JoinHandler from "./JoinHandler";
import expressServer from "./api/express-server";
import DatabaseManager from "./DatabaseManager";
import Discord, { Intents } from "discord.js";
import log from "./log";
import ContextMenuCommandManager from "./managers/ContextMenuCommandManager";
import SlashCommandManager from "./managers/SlashCommandManager";
import BotGuildManager from "./managers/BotGuildManager";
import ACommandManager from "./managers/ACommandManager";

// process.on("unhandledRejection", (reason, p) => {
//   console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
//   console.log((reason as any).stack);
//   // application specific logging, throwing an error, or other logic here
// });

const soundBot = new Discord.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_INTEGRATIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES,
  ],
  partials: ["CHANNEL", "GUILD_MEMBER"],
});
const dbManager = DatabaseManager.getInstance();

log.info("starting for " + process.env.NODE_ENV);

const soundBotToken = process.env.SOUND_BOT_TOKEN; // dev

const slashCommandManager = SlashCommandManager.getInstance(soundBot);
const contextMenuCommandManager =
  ContextMenuCommandManager.getInstance(soundBot);
const botGuildManager = new BotGuildManager(soundBot);

soundBot.on("ready", async () => {
  const statusSetter = () => {
    soundBot.user.setActivity("sounds.pothi.eu", {
      type: "WATCHING",
      url: "https://sounds.pothi.eu",
    });
  };

  statusSetter();
  setInterval(statusSetter, 1800000);

  botGuildManager.start();

  slashCommandManager.start();
  contextMenuCommandManager.start();

  // ACommandManager.setGuildCommands(
  //   slashCommandManager,
  //   contextMenuCommandManager
  // );
  log.info("Bot is ready");
});

const messageHandler = new MessageHandler(soundBot);
messageHandler.start();

const joinHandler = new JoinHandler(soundBot);
joinHandler.start();

soundBot.login(soundBotToken);

expressServer.init(soundBot);
