import DatabaseManager from './DatabaseManager';
import AudioManager from './AudioManager'
import Discord from 'discord.js';
import Conversation from './Conversation'
import fs from 'fs';
import request from 'http-async';
import path from 'path';
import { parseFile } from 'music-metadata';
import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import Sound from './models/Sound'
import Guild from './models/Guild'
import User from './models/User'

const open = util.promisify(fs.open);
const write = util.promisify(fs.write);
const close = util.promisify(fs.close);
const unlink = util.promisify(fs.unlink);

const dbManager = new DatabaseManager('discord');
const audioManager = new AudioManager()

export default class MessageHandler {
    constructor(bot, commandPrefix) {
        this.bot = bot;
        this.commandPrefix = commandPrefix;
    }

    start() {
        this.bot.on('message', message => this.handle(message));
    }

    handle(msg) {
        if (msg.guild !== null) {
            if (!msg.content.startsWith(this.commandPrefix)) {
                return;
            }
            let args = msg.content.substr(this.commandPrefix.length).split(' ');
            switch (args[0]) {
                case "debug":
                    msg.reply();
                default:
                    dbManager.getGuild({ discordId: msg.guild.id }).then(guild => {
                        console.log('guild', guild)
                        dbManager.getSound({ command: args[0], guild: guild }).then(sound => {
                            console.log('sound', sound)
                            console.log('for command', args[0], 'and guild', guild._id)
                            if (sound) {
                                msg.reply(sound.filename).then(msg => setTimeout(() => msg.delete(), 3000));
                                if (msg.member.voiceChannel) {
                                    audioManager.play(sound, msg.member.voiceChannel).catch(err => console.error(err));
                                }
                            }
                            else {
                                msg.reply('Kein Befehl gefunden').then(
                                    msg => setTimeout(() => msg.delete(), 3000))
                            }
                        })
                    });
            }

            msg.delete();
        }
        else {
            if (msg.channel.type === "dm") {
                let activeConversation = Conversation.checkUserConversation(msg.author.id);
                if (activeConversation) {
                    activeConversation.trigger(msg);
                    return;
                }

                let args = msg.content.split(' ');
                switch (args[0]) {
                    case 'ul':
                    case "upload":
                        new Conversation(
                            msg,
                            [
                                {
                                    title: 'Befehl',
                                    message(conv) {
                                        return "Bitte gib den gewünschten Befehl ein, mit dem die Datei später abgespielt werden soll (ohne das \"!\" am Anfang)\n**(Zwischen 3 und 15 Zeichen)**";
                                    },
                                    acceptedAnswers(message, conv) {
                                        return /^[a-zA-Z]{3,15}$/.test(message.content.trim()) ? message.content : false;
                                    }
                                },
                                {
                                    title: "Server",
                                    message(conv) {
                                        const embed = new Discord.RichEmbed()
                                            .setTitle("Für welchen der folgenden Server soll der Befehl erstellt werden?")
                                            .setDescription("(Bitte die Nummer angeben)")
                                            .addBlankField();
                                        let intersectingGuilds = [];
                                        for (let guild of msg.client.guilds.array()) {
                                            for (let member of guild.members.array()) {
                                                if (msg.author.id === member.id) {
                                                    intersectingGuilds.push(guild);
                                                    break;
                                                }
                                            }
                                        }

                                        for (let i = 0; i < intersectingGuilds.length; i++) {
                                            embed.addField("Nr: " + (i + 1), intersectingGuilds[i].name, true);
                                        }
                                        return embed;
                                    },
                                    acceptedAnswers(message, conv) {
                                        let number = parseInt(message.content.trim());
                                        if (isNaN(number)) {
                                            return false;
                                        }
                                        let intersectingGuilds = [];
                                        for (let guild of msg.client.guilds.array()) {
                                            for (let member of guild.members.array()) {
                                                if (msg.author.id === member.id) {
                                                    intersectingGuilds.push(guild);
                                                    break;
                                                }
                                            }
                                        }
                                        if (number > intersectingGuilds.length || number < 1) {
                                            return false;
                                        }
                                        return intersectingGuilds[number - 1];
                                    }
                                },
                                {
                                    title: "Audio Datei",
                                    message(conv) {
                                        return "Bitte schicke mir eine Audiodatei im **MP3** oder **FLAC** Format.\nDie Datei darf nicht größer als 750kb sein."
                                    },
                                    async acceptedAnswers(message, conv) {
                                        if (message.attachments.array().length === 0) {
                                            console.log("no attachments")
                                            return false;
                                        }
                                        let att = message.attachments.first();
                                        if (att.filesize > 750000) {
                                            console.log("too big")
                                            return false;
                                        }
                                        let split = att.filename.split('.');
                                        let ext = split[split.length - 1];
                                        if (!(ext == 'mp3' || ext == 'flac')) {
                                            console.log("wrong format", ext)
                                            return false;
                                        }

                                        let resp = await request('GET', att.url)

                                        const filename = `${split[0]}_${uuidv4()}.${ext}`;
                                        const filepath = `${path.dirname(require.main.filename)}/sounds/${filename}`;
                                        let fd = await open(filepath, 'w');
                                        await write(fd, resp.content, 0, resp.content.length, null);

                                        let metadata = await parseFile(filepath)
                                        if (metadata.format.duration > 30) {
                                            unlink(filepath);
                                            return false;
                                        }
                                        return { filename, filepath, oldFilename: att.filename };
                                    },
                                    revert(conv, action) {
                                        if (!action.result) {
                                            return;
                                        }
                                        fs.unlink(`${path.dirname(require.main.filename)}/sounds/${action.result.filename}`, (err) => { });
                                    }
                                },

                            ],
                            600000 /* 10 min = 600000 */,
                            async (conv) => {
                                // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
                                let guild = await dbManager.getGuild({ discordId: conv.actionStack[1].result.id });
                                let creator = await dbManager.getUser({ discordId: conv.triggerMessage.author.id });
                                console.log('filename', conv.actionStack[2].result.filename);
                                let sound = await Sound.model.create({
                                    command: conv.actionStack[0].result,
                                    filename: conv.actionStack[2].result.filename,
                                    guild,
                                    creator
                                });
                                console.log('sound', sound)
                            },
                            () => console.log("conversation error"));
                        break;
                    case "baum":
                        let actionsStack = [
                            {
                                title: "Baum",
                                message(conv) { return "Nachricht 1" },
                                result: undefined,
                                acceptedAnswers(message) { return /.+/i.test(message.content.trim()) ? message.content.trim() : false }, // regex
                            },
                            {
                                title: "Blume",
                                message(conv) { return "Nachricht 2" },
                                result: undefined,
                                acceptedAnswers(message) { return /2/i.test(message.content.trim()) ? message.content.trim() : false }, // regex
                            },
                        ]
                        new Conversation(
                            msg,
                            actionsStack,
                            600000 /* 10 min = 600000 */,
                            () => console.log("conversation success"),
                            () => console.log("conversation error"));
                        break;
                    default:
                }
                return;
            }
        }
    }
}