import DatabaseManager from './DatabaseManager';
import AudioManager from './AudioManager'
import MessageDeleter from './MessageDeleter'
import JokeHandler from './JokeHandler'
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
const deleter = new MessageDeleter()
const jokeHandler = new JokeHandler()

export default class MessageHandler {
    constructor(bot) {
        this.bot = bot;
    }

    static async commandPrefix(guild) {
        let discordGuild = await dbManager.getGuild({ discordId: guild.id });
        return discordGuild.commandPrefix;
    }

    start() {
        this.bot.on('message', message => this.handle(message));
    }

    async handle(msg) {
        if (msg.author.bot) {
            return;
        }
        if (msg.guild !== null) {
            let prefix = await MessageHandler.commandPrefix(msg.guild);
            if (!msg.content.startsWith(prefix)) {
                return;
            }

            const inputMessageDeleter = deleter.add(msg)

            let args = msg.content.substr(prefix.length).split(' ');
            switch (args[0]) {
                case "joke":
                    let joke = await jokeHandler.getJoke();
                    console.log(joke);
                    msg.reply(joke).then(m => deleter.add(m, 30000));
                    break;
                case "gif":
                    let gif = await jokeHandler.getGif(args[1]);
                    msg.reply(gif).then(m => deleter.add(m, 30000));
                    break;
                case "commands":
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id });
                    console.log("guild", guild);
                    let sounds = await dbManager.getAllGuildSounds(guild);

                    console.log("sounds", sounds)

                    let embeds = MessageHandler.createEmbeds(sounds, sound => {
                        return [prefix + sound.command, sound.description]
                    }, (embed, i) => {
                        embed.setTitle(`Audiobefehle:`);
                        embed.setFooter(prefix + "help für weitere Informationen");
                        embed.setColor("ORANGE");
                    });

                    embeds.forEach(embed => msg.reply(embed).then(m => deleter.add(m)))

                    break;
                case "debug":
                    console.log(msg.client.guilds.cache[0])
                    break;
                case "help":
                case "hilfe":
                    msg.reply("hättest du wohl gerne...").then(m => deleter.add(m))
                    break;
                default:
                    dbManager.getGuild({ discordId: msg.guild.id }).then(guild => {
                        dbManager.getSound({ command: args[0], guild: guild }).then(sound => {
                            if (sound) {
                                msg.reply("**" + sound.command + "** - " + sound.description).then(m => deleter.add(m));

                                clearTimeout(inputMessageDeleter);
                                deleter.add(msg, 0)

                                if (msg.member.voice.channel) {
                                    audioManager.play(sound, msg.member.voice.channel).catch(err => console.error(err));
                                }
                            }
                            else {
                            }
                        })
                    });
            }
        }
        else if (msg.channel.type === "dm") {
            let activeConversation = Conversation.checkUserConversation(msg.author.id);
            if (activeConversation) {
                activeConversation.trigger(msg);
                return;
            }

            let args = msg.content.split(' ');
            switch (args[0]) {
                case 'ul':
                case "upload": {
                    let conv = this.startSoundUploadConv(msg);
                    conv.sendNextCallToAction();
                    break;
                }
                case "remove":
                case "delete": {
                    let conv = this.startSoundDeleteConv(msg);
                    conv.sendNextCallToAction();
                    break;
                }
                case "joinsound":
                case "join":
                    let actionStack = [
                        {
                            title: "Server",
                            message(conv) {
                                let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                                let embeds = MessageHandler.createEmbeds(intersectingGuilds, (guild, i) => {
                                    return ["Nr. " + (i + 1), guild.name]
                                }, (embed, i) => {
                                    embed.setTitle("Für welchen Server willst du diese Einstellung ändern?")
                                    embed.setDescription("(Bitte die Nummer angeben)")
                                    embed.addField('\u200b', '\u200b');
                                    embed.setColor("ORANGE");
                                });

                                return embeds
                            },
                            result: undefined,
                            acceptedAnswers(message, conv) {
                                let number = parseInt(message.content.trim());
                                if (isNaN(number)) {
                                    return false;
                                }
                                let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
                                if (number > intersectingGuilds.length || number < 1) {
                                    return false;
                                }
                                return intersectingGuilds[number - 1];
                            }
                        },
                        {
                            title: "Befehl",
                            async message(conv) {
                                return "Schreibe mir den Befehl **ohne \"" + await MessageHandler.commandPrefix(conv.actionStack[0].result) + "\"** am Anfang";
                            },
                            result: undefined,
                            async acceptedAnswers(message, conv) {
                                let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id })
                                let sounds = await dbManager.getAllGuildSounds(guild)

                                for (const sound of sounds) {
                                    if (sound.command === message.content.trim()) {
                                        return sound;
                                    }
                                }
                                return false;
                            }
                        }
                    ];
                    let conversation = new Conversation(msg, actionStack, 600000 /* 10 min = 600000 */,
                        async (conv) => {
                            // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
                            let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id });
                            console.log("guild 1:", guild);
                            guild.joinSounds.set(msg.author.id, conv.actionStack[1].result);
                            console.log("guild 2:", guild);
                            await guild.save();
                        },
                        () => console.log("conversation error"))
                    conversation.sendNextCallToAction();
                    break;
                case "hilfe":
                case "help":
                    msg.reply("Daran wird noch gearbeitet :)");
                    break;
                default:
            }

            if (msg.attachments.size > 0) {

                let conversation = this.startSoundUploadConv(msg);
                let stackItem = conversation.actionStack[3];
                let accepted = await stackItem.acceptedAnswers(msg, conversation);


                if (!!accepted) {
                    stackItem.result = accepted;
                    conversation.acceptInput(accepted);
                }
                else {
                    msg.reply("**Keine gültige Audiodatei**");
                    let messages = await stackItem.message(conversation);
                    if (Array.isArray(messages)) {
                        messages.forEach(message => msg.reply(message))
                    }
                    else {
                        msg.reply(messages);
                    }
                    conversation.abort();
                }
            }
            return;

        }
    }

    startSoundDeleteConv(msg) {
        let conv = new Conversation(msg, [
            {
                title: "Server",
                async message(conv) {
                    let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                    let relevantGuilds = [];
                    for (let guild of intersectingGuilds) {
                        let member = guild.member(msg.author);
                        if (member.hasPermission("ADMINISTRATOR")) {
                            relevantGuilds.push(guild);
                            continue;
                        }
                        let dbGuild = await dbManager.getGuild({ discordId: guild.id })
                        let dbUser = await dbManager.getUser({ discordId: msg.author.id })
                        let soundCount = await Sound.model.count({ guild: dbGuild, creator: dbUser.id }).exec();
                        if (soundCount > 0) {
                            relevantGuilds.push(guild);
                        }
                    }

                    if (relevantGuilds.length === 0) {
                        msg.reply("Es gibt keine Server, auf denen du Befehle löschen kannst");
                        conv.abort();
                        return;
                    }

                    let embeds = MessageHandler.createEmbeds(relevantGuilds, (guild, i) => {
                        return ["Nr. " + (i + 1), guild.name]
                    }, (embed, i) => {
                        embed.setTitle("Serverliste:")
                        embed.setDescription("Von welchem Server soll ein Befehl gelöscht werden? **(Bitte die Nummer angeben)**")
                        embed.addField('\u200b', '\u200b');
                        embed.setColor("ORANGE");
                    });

                    return embeds
                },
                async acceptedAnswers(message, conv) {
                    let number = parseInt(message.content.trim());
                    if (isNaN(number)) {
                        return false;
                    }

                    let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                    let relevantGuilds = [];
                    for (let guild of intersectingGuilds) {
                        let member = guild.member(msg.author);
                        if (member.hasPermission("ADMINISTRATOR")) {
                            relevantGuilds.push(guild);
                            continue;
                        }
                        let dbGuild = await dbManager.getGuild({ discordId: guild.id })
                        let dbUser = await dbManager.getUser({ discordId: msg.author.id })
                        let soundCount = await Sound.model.count({ guild: dbGuild, creator: dbUser.id }).exec();
                        if (soundCount > 0) {
                            relevantGuilds.push(guild);
                        }
                    }


                    if (number > relevantGuilds.length || number < 1) {
                        return false;
                    }
                    return relevantGuilds[number - 1];
                }
            },
            {
                title: "Befehl",
                async message(conv) {
                    let member = conv.actionStack[0].result.member(msg.author);
                    let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id })
                    console.log("guild:", guild)

                    let relevantSounds = [];

                    if (member.hasPermission("ADMINISTRATOR")) {
                        relevantSounds = await dbManager.getAllGuildSounds(guild)
                        console.log("all sounds:", relevantSounds)
                    }
                    else {
                        let dbUser = await dbManager.getUser({ discordId: member.id })
                        relevantSounds = await dbManager.getSounds({ guild, creator: dbUser })
                    }

                    if (relevantSounds.length === 0) {
                        msg.reply("Es gibt keine Befehle zum löschen...");
                        conv.abort();
                        return;
                    }
                    let embeds = MessageHandler.createEmbeds(relevantSounds, (sound, i) => {
                        return [guild.commandPrefix + sound.command, sound.description]
                    }, (embed, i) => {
                        embed.setTitle(`Folgende Audiobefehle können gelöscht werden:`);
                        embed.setDescription("Befehl **ohne \"" + guild.commandPrefix + "\"** angeben");
                        embed.setColor("ORANGE");
                    });
                    return embeds;
                },
                async acceptedAnswers(message, conv) {
                    let member = conv.actionStack[0].result.member(msg.author);
                    let dbGuild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id })
                    let sound = await dbManager.getSound({ guild: dbGuild, command: message.content.trim() })

                    if (!sound) {
                        return false;
                    }

                    if (member.hasPermission("ADMINISTRATOR")) {
                        return sound;
                    }
                    let dbUser = await dbManager.getUser({ discordId: member.id })
                    return dbUser._id.equals(sound.creator) ? sound : false;
                }
            }
        ], 600000, conv => {
            fs.unlink(`${path.dirname(require.main.filename)}/sounds/${conv.actionStack[1].result.filename}`, (err) => { if (err) { console.error("Couldn't delete file", err) } });
            conv.actionStack[1].result.delete();
        }, () => { })
        return conv;
    }

    startSoundUploadConv(msg) {
        let conv = new Conversation(
            msg,
            [
                {
                    title: 'Befehl',
                    message(conv) {
                        return "Bitte gib den gewünschten Befehl ein, mit dem die Datei später abgespielt werden soll (ohne das \"!\" am Anfang)\n**(Zwischen 3 und 15 Zeichen)**";
                    },
                    acceptedAnswers(message, conv) {
                        return /^[a-zA-ZäÄöÖüÜß]{3,15}$/.test(message.content.trim()) ? message.content : false;
                    }
                },
                {
                    title: 'Beschreibung',
                    message(conv) {
                        return "Bitte gib eine kurze Beschreibung für den Befehl ein\n**(Zwischen 3 und 40 Zeichen)**";
                    },
                    acceptedAnswers(message, conv) {
                        return /^.{3,40}$/.test(message.content.trim()) ? message.content : false;
                    }
                },
                {
                    title: "Server",
                    message(conv) {

                        let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                        let embeds = MessageHandler.createEmbeds(intersectingGuilds, (guild, i) => {
                            return ["Nr. " + (i + 1), guild.name]
                        }, (embed, i) => {
                            embed.setTitle("Serverliste:")
                            embed.setDescription("Für welchen der folgenden Server soll der Befehl erstellt werden? **(Bitte die Nummer angeben)**")
                            embed.addField('\u200b', '\u200b');
                            embed.setColor("ORANGE");
                        });

                        return embeds
                    },
                    acceptedAnswers(message, conv) {
                        let number = parseInt(message.content.trim());
                        if (isNaN(number)) {
                            return false;
                        }
                        let intersectingGuilds = MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
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
                        let split = att.name.split('.');
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
                let guild = await dbManager.getGuild({ discordId: conv.actionStack[2].result.id });
                let creator = await dbManager.getUser({ discordId: conv.triggerMessage.author.id });
                console.log('filename', conv.actionStack[2].result.filename);
                let sound = await Sound.model.create({
                    command: conv.actionStack[0].result,
                    description: conv.actionStack[1].result,
                    filename: conv.actionStack[3].result.filename,
                    guild,
                    creator
                });
                console.log('sound', sound)
            },
            () => console.log("conversation error"));
        return conv;
    }

    static createEmbeds(list, itemToTtleAndDescription, modifyEmbed) {
        let embeds = [];
        embeds.push(new Discord.MessageEmbed());

        for (let i = 0; i < list.length; i++) {
            let [title, description] = itemToTtleAndDescription(list[i], i);
            let embed = embeds[embeds.length - 1];

            if (embed.fields.length >= 25 || embed.length + title.length + description.length >= 6000) {
                embeds.push(new Discord.MessageEmbed());
                embed = embeds[embeds.length - 1];
            }

            embed.addField(title, description, true)
        }

        embeds.forEach((embed, i) => {
            let sum = embeds.length
            modifyEmbed(embed, i)
            if (embeds.length > 1) {
                embed.setTitle(embed.title + (sum > 1 ? " (" + (i + 1) + "/" + sum + ")" : ""))
            }
        })
        return embeds;
    }

    static getIntersectingGuildsOfAuthor(author) {
        let intersectingGuilds = [];
        for (let guild of author.client.guilds.cache.array()) {
            for (let member of guild.members.cache.array()) {
                if (author.id === member.id) {
                    intersectingGuilds.push(guild);
                    break;
                }
            }
        }
        return intersectingGuilds;
    }

}