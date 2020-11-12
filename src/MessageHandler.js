import DatabaseManager from './DatabaseManager';
import AudioManager from './AudioManager'
import MessageDeleter from './MessageDeleter'
import JokeHandler from './JokeHandler'
import SoundManager from './SoundManager'
import { MessageEmbed, MessageAttachment } from 'discord.js';
import Conversation from './Conversation'
import fs from 'fs';
import stream from 'stream';
import streamToBuffer from 'stream-to-buffer';
import request from 'http-async';
import path from 'path';
import { parseFile, parseBuffer, parseStream } from 'music-metadata';
import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import log from '../log'
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

const BASE_URL = process.env.BASE_URL;

export default class MessageHandler {
    constructor(bot) {
        this.bot = bot;
    }

    static async commandPrefix(guild) {
        let dbGuild = await dbManager.getGuild({ discordId: guild.id });
        return dbGuild.commandPrefix;
    }

    start() {
        this.bot.on('message', message => { this.handle(message) });
    }

    async handle(msg) {
        if (msg.author.bot) {
            return;
        }
        if (msg.guild !== null) {
            log.debug(`message detected: ${msg.content}`)
            let prefix = await MessageHandler.commandPrefix(msg.guild);
            if (!msg.content.startsWith(prefix)) {
                return;
            }


            const inputMessageDeleter = deleter.add(msg)

            let args = msg.content.substr(prefix.length).split(' ');
            log.info(`commands detected: ${args[0]}`);
            switch (args[0]) {
                case "joke":
                    let joke = await jokeHandler.getJoke();
                    log.debug(joke);
                    msg.reply(joke).then(m => deleter.add(m, 30000));
                    break;
                case "gif":
                    let gif = await jokeHandler.getGif(args[1]);
                    msg.reply(gif).then(m => deleter.add(m, 30000));
                    break;
                case "commands": {
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id });
                    let sounds = await dbManager.getAllGuildSounds(guild);


                    let embeds = MessageHandler.createEmbeds(sounds, sound => {
                        return [prefix + sound.command, sound.description]
                    }, (embed, i) => {
                        embed.setTitle("-> Hier gibt es eine Übersicht <-");
                        embed.setURL(`${process.env.BASE_URL}/#/guilds?guild=${msg.guild.id}`)
                        embed.setDescription(`**Audiobefehle:**`)
                        embed.setFooter(prefix + "help für weitere Informationen");
                        embed.setColor("ORANGE");
                    });

                    embeds.forEach(embed => msg.reply(embed).then(m => deleter.add(m, 120000)))
                    break;
                }
                case "download":
                case "dl": {
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id });
                    if (!args[1] || args[1].startsWith(guild.commandPrefix)) {
                        msg.reply(`Bitte einen Befehl **ohne "${guild.commandPrefix}"** angeben`).then(m => deleter.add(m, 60000));
                        return;
                    }
                    let commandString = args[1].trim();
                    let sound = await dbManager.getSound({ guild, command: commandString })
                    if (!sound) {
                        msg.reply(`Es wurde kein Sound mit dem Befehl **${commandString}** gefunden.`).then(m => deleter.add(m, 60000));
                        return;
                    }

                    let stream = dbManager.getFileStream(sound.file._id);
                    let file = await dbManager.getFile(sound.file._id);
                    console.log(file)
                    let attachment = new MessageAttachment(stream, file.filename);
                    msg.reply(`Hier hast du die Datei :smirk:`, attachment).then(m => deleter.add(m, 60000));
                }
                case "debug":
                    log.debug(msg.client.guilds.cache[0])
                    break;
                case "migrate": {
                    if (msg.author.id !== process.env.BOT_OWNER) {
                        return;
                    }

                    let allSounds = await dbManager.getSounds({});
                    for (const sound of allSounds) {
                        if (!sound.filename) {
                            sound.filename = undefined;
                            sound.update();
                        }
                        continue;

                        if (sound.file || !sound.filename) {
                            log.warn(`sound "${sound.command}" not matching`)
                            continue;
                        }

                        let filename = sound.filename;
                        log.debug("filename created");
                        let filepath = `${path.dirname(require.main.filename)}/sounds/${filename}`
                        log.debug("filepath created");
                        let readstream = fs.createReadStream(filepath);
                        log.debug("readstream created");
                        let file = await dbManager.storeFile({ filename: sound.filename }, readstream);
                        log.debug("db-file created");
                        if (!file) {
                            log.error(`Could not save File ${filename}`)
                            continue;
                        }

                        sound.file = new dbManager.mongoose.Types.ObjectId(file._id);
                        log.debug("sound.file set");
                        // sound.filename = undefined;
                        // log.debug("sound.filename unset");
                        try {
                            await sound.save()
                        }
                        catch (e) {
                            log.error("Can't save sound")
                            log.error(e)
                            file.unlink(() => { });
                            continue;
                        }
                        log.debug("sound saved");
                        fs.unlink(filepath, () => { });
                        log.debug("file deleted");
                    }
                    break;
                }
                case "help":
                case "hilfe": {
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id });
                    let commandPrefix = guild.commandPrefix;
                    let embed = new MessageEmbed();
                    embed.setTitle("-> Hier klicken für weiter Informationen <-")
                    embed.setURL(process.env.BASE_URL)
                    embed.setDescription("**Hier findest du alle Befehle mit einer kurzen Beschreibung** :blush: ")
                    embed.setColor("ORANGE");

                    // sound
                    embed.addField(`${commandPrefix}<Sound>`, `Lässt mich den <Sound> spielen. Alle sounds können mit ${commandPrefix}commands eingesehen werden.`)

                    // random
                    embed.addField(`${commandPrefix}random`, `Lässt mich einen zufälligen Sound abspielen`)

                    // joke
                    embed.addField(`${commandPrefix}joke`, `Lässt mich dir einen zufälligen Witz senden.`)

                    // gif 
                    embed.addField(`${commandPrefix}gif <Begriff>`, `Lässt mich ein GIF senden, dass ich für <Begriff> finde.`)

                    // commands
                    embed.addField(`${commandPrefix}commands`, `Lässt mich alle Sound-Befehle anzeigen, die auf diesem Server verfügbar sind.`)

                    // download
                    embed.addField(`${commandPrefix}download <Sound>`, `Lässt mich die Audiodatei von <Sound> senden. <Sound> ist ein Soundbefehl ohne "${commandPrefix}"`)

                    // help
                    embed.addField(`${commandPrefix}help`, `Wow.... :smirk:`)

                    embed.setFooter('Wenn du mir per DM "help" oder "hilfe" sendest, Sage ich dir, was du dort alles machen kannst.');

                    msg.reply(embed).then(m => deleter.add(m));

                    break;
                }
                case "random": {
                    deleter.add(msg, 2000)
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id });
                    let sound = await dbManager.getRandomSoundForGuild(guild._id);
                    log.debug(sound[0])
                    // let sound = await dbManager.getSound({ command: args[0], guild: guild });
                    audioManager.playSound(sound[0], msg, args)
                    break;
                }
                default:
                    deleter.add(msg, 2000)
                    let guild = await dbManager.getGuild({ discordId: msg.guild.id })
                    let sound = await dbManager.getSound({ command: args[0], guild: guild })
                    audioManager.playSound(sound, msg, args)


            }
        }
        else if (msg.channel.type === "dm") {
            let activeConversation = Conversation.checkUserConversation(msg.author.id);
            if (activeConversation) {
                activeConversation.trigger(msg);
                return;
            }

            let args = msg.content.split(' ');
            if (args[0].startsWith("!")) {
                args[0] = args[0].substr(1);
            }

            switch (args[0]) {
                case "help":
                case "hilfe": {
                    let embed = new MessageEmbed()
                    embed.setTitle("-> Hier klicken für weiter Informationen <-")
                    embed.setURL(process.env.BASE_URL)
                    embed.setDescription("**Hier findest du alle Befehle mit einer kurzen Beschreibung** :blush: ")
                    embed.setColor("ORANGE");

                    // upload
                    embed.addField(`upload`, `Damit startest du den Prozess, um einen neuen Sound-Befehl für einen Server zu erstellen. Folge einfach den Anweisungen.`)

                    // remove
                    embed.addField(`remove`, `Damit startest du den Prozess, um einen deiner Soundbefehle von einem Server endgültig zu löschen.`)

                    // joinsound
                    embed.addField(`joinsound`, `Damit startest du den Prozess, um für einen Server einen Join-Sound fürr dich einzustellen`)

                    //joinsounddelete
                    embed.addField(`joinsounddelete`, `Damit startest du den Prozess, um für einen Server den Join-Sound auszuschalten`)

                    //help
                    embed.addField(`help`, `Selbsterklärend :smirk:`)


                    msg.reply(embed);
                    break;
                }
                case 'ul':
                case "upload": {
                    let conv = this.startSoundUploadConv(msg);
                    conv.sendNextCallToAction();
                    break;
                }
                case "joindelete":
                case "joinsounddelete": {
                    let conv = this.startJoinSoundDeleteConv(msg);
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
                            async message(conv) {
                                let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                                let embeds = MessageHandler.createEmbeds(intersectingGuilds, (guild, i) => {
                                    return ["Nr. " + (i + 1), guild.name]
                                }, (embed, i) => {
                                    embed.setDescription("**Für welchen Server willst du diese Einstellung ändern?**\n(Bitte die Nummer angeben)")
                                    embed.addField('\u200b', '\u200b');
                                    embed.setColor("ORANGE");
                                });

                                return embeds
                            },
                            result: undefined,
                            async acceptedAnswers(message, conv) {
                                let number = parseInt(message.content.trim());
                                if (isNaN(number)) {
                                    return false;
                                }
                                let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
                                if (number > intersectingGuilds.length || number < 1) {
                                    return false;
                                }
                                return intersectingGuilds[number - 1];
                            }
                        },
                        {
                            title: "Befehl",
                            async message(conv) {
                                let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id });
                                let _id = guild.joinSounds.get(conv.triggerMessage.author.id);
                                let currentCommand = await dbManager.getSound({ _id })
                                log.debug(currentCommand)

                                let message = "";
                                if (!!currentCommand) {
                                    message += `Der aktuelle Befehl für diesen Server ist **${guild.commandPrefix}${currentCommand.command}**\n`
                                }
                                else {
                                    message += "Für diesen Server ist aktuell kein Befehl gesetzt\n"
                                }
                                message += `Schreibe mir den Befehl **ohne "${guild.commandPrefix}"** am Anfang`
                                log.debug(message)
                                return message;
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
                            guild.joinSounds.set(conv.triggerMessage.author.id, conv.actionStack[1].result);
                            await guild.save();
                        },
                        () => log.warn("conversation error"))
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

    startJoinSoundDeleteConv(msg) {
        let conv = new Conversation(msg, [
            {
                title: "Server",
                async message(conv) {
                    let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                    let embeds = MessageHandler.createEmbeds(intersectingGuilds, (guild, i) => {
                        return ["Nr. " + (i + 1), guild.name]
                    }, (embed, i) => {
                        embed.setDescription("*+Serverliste:**\nFür welchen Server willst du deinen Join-Sound deaktivieren? **(Bitte die Nummer angeben)**")
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
                    let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
                    if (number > intersectingGuilds.length || number < 1) {
                        return false;
                    }
                    return intersectingGuilds[number - 1];
                }
            }
        ], 600000, async conv => {
            let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id });
            guild.joinSounds.delete(conv.triggerMessage.author.id);
            await guild.save();
        }, () => { });
        return conv;
    }

    startSoundDeleteConv(msg) {
        let conv = new Conversation(msg, [
            {
                title: "Server",
                async message(conv) {
                    let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                    let relevantGuilds = [];
                    for (let guild of intersectingGuilds) {
                        let member = await guild.members.fetch(msg.author);
                        if (member && member.hasPermission("ADMINISTRATOR")) {
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
                        embed.setDescription("**Serverliste:**\nVon welchem Server soll ein Befehl gelöscht werden? **(Bitte die Nummer angeben)**")
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

                    let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                    let relevantGuilds = [];
                    for (let guild of intersectingGuilds) {
                        let member = await guild.member.fetch(msg.author);
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
                    let member = await conv.actionStack[0].result.members.fetch(msg.author);
                    let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id })
                    console.debug(`guild: ${guild}`)

                    let relevantSounds = [];

                    if (member.hasPermission("ADMINISTRATOR")) {
                        relevantSounds = await dbManager.getAllGuildSounds(guild)
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
                        embed.setDescription("**Folgende Audiobefehle können gelöscht werden:**\nBefehl **ohne \"" + guild.commandPrefix + "\"** angeben");
                        embed.setColor("ORANGE");
                    });
                    return embeds;
                },
                async acceptedAnswers(message, conv) {
                    let member = await conv.actionStack[0].result.members.fetch(msg.author);
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
        ], 600000, async conv => {
            await dbManager.unlinkFile(conv.actionStack[1].result.file)
            conv.actionStack[1].result.delete();
        }, () => { })
        return conv;
    }

    startSoundUploadConv(msg) {
        let conv = new Conversation(
            msg,
            [
                {
                    title: "Server",
                    async message(conv) {

                        let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author)

                        let embeds = MessageHandler.createEmbeds(intersectingGuilds, (guild, i) => {
                            return ["Nr. " + (i + 1), guild.name]
                        }, (embed, i) => {
                            embed.setDescription("**Serverliste:**\nFür welchen der folgenden Server soll der Befehl erstellt werden? **(Bitte die Nummer angeben)**")
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
                        let intersectingGuilds = await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
                        if (number > intersectingGuilds.length || number < 1) {
                            return false;
                        }
                        return intersectingGuilds[number - 1];
                    }
                },
                {
                    title: 'Befehl',
                    message(conv) {
                        let guild = dbManager.getGuild({ discordId: conv.actionStack[0].result.id })
                        return `Bitte gib den gewünschten Befehl ein, mit dem die Datei später abgespielt werden soll (ohne das "${guild.commandPrefix}" am Anfang)\n**(Zwischen 3 und 15 Zeichen)**`;
                    },
                    async acceptedAnswers(message, conv) {
                        let command = message.content.trim();
                        let guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id });
                        const isSoundIllegal = await SoundManager.isCommandIllegal(command, guild)
                        if (!!isSoundIllegal) {
                            log.warn(isSoundIllegal)
                            return false;
                        }
                        return command;
                    }
                },
                {
                    title: 'Beschreibung',
                    message(conv) {
                        return "Bitte gib eine kurze Beschreibung für den Befehl ein\n**(Zwischen 3 und 40 Zeichen)**";
                    },
                    acceptedAnswers(message, conv) {
                        const descriptionIllegal = SoundManager.isDescriptionIllegal(message.content)
                        if (!!descriptionIllegal) {
                            log.warn(descriptionIllegal);
                            return false;
                        }
                        return message.content;
                    }
                },
                {
                    title: "Audio Datei",
                    message(conv) {
                        return "Bitte schicke mir eine Audiodatei im **MP3** oder **FLAC** Format.\nDie Datei darf nicht größer als 1MB und nicht länger als 30 Sekunden sein."
                    },
                    async acceptedAnswers(message, conv) {
                        if (message.attachments.array().length === 0) {
                            log.warn("no attachments")
                            return false;
                        }
                        let att = message.attachments.first();

                        const soundManager = new SoundManager();
                        if (!soundManager.checkFileSize(att.size)) {
                            log.warn("too big")
                            return false;
                        }

                        if (!soundManager.checkFileExtension(att.name)) {
                            log.warn(`wrong format`)
                            return false;
                        }

                        let resp = await request('GET', att.url)

                        if (!soundManager.checkFileMetadata(resp.content)) {
                            return false;
                        }

                        const filename = soundManager.createUniqueFilename(att.name);

                        const file = await soundManager.storeFile(resp.content)

                        return { filename, oldFilename: att.filename, dbFile: file, soundManager: soundManager };
                    },
                    revert(conv, action) {
                        if (!action.result) {
                            return;
                        }
                        action.result.dbFile.unlink(err => { if (err) log.error(err) })
                        // dbManager.unlinkFile(action.result.dbFile._id);
                        // fs.unlink(`${path.dirname(require.main.filename)}/sounds/${action.result.filename}`, (err) => { });
                    }
                },

            ],
            600000 /* 10 min = 600000 */,
            async (conv) => {
                // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
                const guild = await dbManager.getGuild({ discordId: conv.actionStack[0].result.id });
                const creator = await dbManager.getUser({ discordId: conv.triggerMessage.author.id });
                const command = conv.actionStack[1].result;
                const description = conv.actionStack[2].result;

                const soundManager = conv.actionStack[3].result.soundManager

                try {
                    await soundManager.createSound(command, description, guild, creator)
                } catch (e) {
                    log.error(e)
                    soundManager.soundFile.unlink(err => { if (err) log.error(err) })
                }
            },
            () => log.warn("conversation error"));
        return conv;
    }

    static createEmbeds(list, itemToTtleAndDescription, modifyEmbed) {
        let embeds = [];
        embeds.push(new MessageEmbed());

        for (let i = 0; i < list.length; i++) {
            let [title, description] = itemToTtleAndDescription(list[i], i);
            let embed = embeds[embeds.length - 1];

            if (embed.fields.length >= 25 || embed.length + title.length + description.length >= 6000) {
                embeds.push(new MessageEmbed());
                embed = embeds[embeds.length - 1];
            }

            embed.addField(title, description, true)
        }

        embeds.forEach((embed, i) => {
            let sum = embeds.length
            modifyEmbed(embed, i)
            if (embeds.length > 1) {
                embed.setDescription(embed.description + (sum > 1 ? "\nSeite (" + (i + 1) + "/" + sum + ")" : ""))
            }
        })
        return embeds;
    }

    static async getIntersectingGuildsOfAuthor(author) {
        let intersectingGuilds = [];
        for (let guild of author.client.guilds.cache.array()) {
            let member = await guild.members.fetch(author)
            if (member) {
                intersectingGuilds.push(guild);
            }
        }
        return intersectingGuilds;
    }

}