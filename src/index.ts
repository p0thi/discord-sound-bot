// https://discord.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
require("dotenv").config();
import MessageHandler from "./MessageHandler";
import JoinHandler from "./JoinHandler";
import expressServer from "./api/express-server";
import DatabaseManager from "./DatabaseManager";
import Discord from "discord.js";
import log from "./log";

const soundBot = new Discord.Client({
  // fetchAllMembers: true
});
const dbManager = new DatabaseManager("discord");

log.info("starting for " + process.env.NODE_ENV);

const soundBotToken = process.env.SOUND_BOT_TOKEN; // dev

soundBot.on("ready", async () => {
  const statusSetter = () => {
    soundBot.user
      .setActivity("sounds.pothi.eu", {
        type: "WATCHING",
        url: "https://sounds.pothi.eu",
      })
      .catch((e) => console.error(e));
  };

  statusSetter();
  setInterval(statusSetter, 1800000);

  log.info("Fetching/creating guilds in database");
  for (const guild of soundBot.guilds.cache.array()) {
    await dbManager.getGuild({ discordId: guild.id });
  }
  log.info("Bot is ready");
});

const messageHandler = new MessageHandler(soundBot);
messageHandler.start();

const joinHandler = new JoinHandler(soundBot);
joinHandler.start();

soundBot.login(soundBotToken);

expressServer.init(soundBot);
