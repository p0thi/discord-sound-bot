// https://discordapp.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
require('dotenv').config()
import MessageHandler from './src/MessageHandler';
import JoinHandler from './src/JoinHandler';
import DatabaseManager from './src/DatabaseManager';
import Discord from 'discord.js';
const bot = new Discord.Client();




const token = process.env.NODE_ENV === 'production' ?
    "MjM0Mjc4MDEzMjI1Nzk1NTg1.XleTLg.xst7uw1B7YGfflZz9hsaCAlages" : // dev
    "MTg1NTQ3Mjc2MTcxNjA4MDY0.Xn0fxg.9vsUG7EGvx8I0NJvm4XFtcdjQLU"; // prod

bot.on("ready", () => {
    console.log("Bot is ready");
});

const messageHandler = new MessageHandler(bot, "!");
messageHandler.start();

const joinHandler = new JoinHandler(bot);
joinHandler.start();

const databaseManager = new DatabaseManager('discord');
databaseManager.connect();


bot.login(token);