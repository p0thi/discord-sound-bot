// https://discordapp.com/oauth2/authorize?client_id=234278013225795585&scope=bot&permissions=36830272
require('dotenv').config()
import MessageHandler from './src/MessageHandler';
import JoinHandler from './src/JoinHandler';
import DatabaseManager from './src/DatabaseManager';
import Discord from 'discord.js';
const soundBot = new Discord.Client();


console.log("starting for " + process.env.NODE_ENV);

const soundBotToken = process.env.SOUND_BOT_TOKEN; // dev

soundBot.on("ready", () => {
    console.log("Bot is ready");
});

const messageHandler = new MessageHandler(soundBot, "!");
messageHandler.start();

const joinHandler = new JoinHandler(soundBot);
joinHandler.start();

const databaseManager = new DatabaseManager('discord');
databaseManager.connect();


soundBot.login(soundBotToken);