// https://discordapp.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
require('dotenv').config()
import MessageHandler from './src/MessageHandler';
import JoinHandler from './src/JoinHandler';
import expressServer from './src/api/express-server'
import DatabaseManager from './src/DatabaseManager'
import Discord from 'discord.js';
import log from './log'

const soundBot = new Discord.Client();
const dbManager = new DatabaseManager('discord');


log.info("starting for " + process.env.NODE_ENV);

const soundBotToken = process.env.SOUND_BOT_TOKEN; // dev

soundBot.on("ready", async () => {
    soundBot.user.setActivity("bot.glowtrap.de", { type: "WATCHING", url: "https://bot.glowtrap.de" }).catch(e => console.error(e))
    
    for (const guild of soundBot.guilds.cache.array()) {
        await dbManager.getGuild({ discordId: guild.id })
    }
    log.info("Bot is ready");
});

const messageHandler = new MessageHandler(soundBot, "!");
messageHandler.start();

const joinHandler = new JoinHandler(soundBot);
joinHandler.start();

soundBot.login(soundBotToken);

expressServer.init(soundBot);