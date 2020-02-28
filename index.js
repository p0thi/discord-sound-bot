// https://discordapp.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
import MessageHandler from './src/MessageHandler';
import DatabaseManager from './src/DatabaseManager';
import Discord from 'discord.js';
const bot = new Discord.Client();

const token = "MjM0Mjc4MDEzMjI1Nzk1NTg1.XleTLg.xst7uw1B7YGfflZz9hsaCAlages";

bot.on("ready", () => {
    console.log("Bot is ready");
});

const messageHandler = new MessageHandler(bot, "!");
messageHandler.start();

const databaseManager = new DatabaseManager('discord');
databaseManager.connect();


bot.login(token);