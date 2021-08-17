import DatabaseManager from "./DatabaseManager";
import AudioManager from "./AudioManager";
import MessageDeleter from "./MessageDeleter";
import SoundManager from "./SoundManager";
import {
  MessageEmbed,
  MessageAttachment,
  Client,
  Guild,
  Message,
  User,
  MessagePayload,
} from "discord.js";
import Conversation, { Action, ActionResultType } from "./Conversation";
import fs from "fs";
import request from "http-async";
import path from "path";
import util from "util";
import log from "./log";
import Sound from "./db/models/Sound";
import SoundModel from "./db/models/Sound";
import IGuild from "./db/interfaces/IGuild";
import ISound from "./db/interfaces/ISound";
import { MongooseGridFSFileModel } from "mongoose-gridfs";

const dbManager = new DatabaseManager("discord");
const audioManager = new AudioManager();
const deleter = new MessageDeleter();

const BASE_URL = process.env.BASE_URL;

export default class MessageHandler {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }

  static async commandPrefix(guild: Guild) {
    let dbGuild = await dbManager.getGuild({ discordId: guild.id });
    return dbGuild.commandPrefix;
  }

  start() {
    this.bot.on("message", (message) => {
      this.handle(message);
    });
  }

  async handle(msg: Message) {
    if (msg.author.bot) {
      return;
    }
    if (msg.guild !== null) {
      log.debug(`message detected: ${msg.content}`);
      const prefix = await MessageHandler.commandPrefix(msg.guild);
      if (!msg.content.startsWith(prefix)) {
        return;
      }

      deleter.add(msg);

      let args = msg.content.substr(prefix.length).split(" ");
      log.info(`commands detected: ${args[0]}`);
      switch (args[0]) {
        case "commands": {
          let guild: IGuild = await dbManager.getGuild({
            discordId: msg.guild.id,
          });
          let sounds: ISound[] = await dbManager.getAllGuildSounds(guild);

          let embeds = MessageHandler.createEmbeds(
            sounds,
            (sound: ISound) => {
              return [prefix + sound.command, sound.description];
            },
            (embed: MessageEmbed, i) => {
              embed.setTitle("-> Here is an overview <-");
              embed.setURL(
                `${process.env.BASE_URL}/#/guilds?guild=${msg.guild.id}`
              );
              embed.setDescription(`**Audio commands:**`);
              embed.setFooter(prefix + "help for more information");
              embed.setColor("ORANGE");
            }
          );

          embeds.forEach((embed: MessageEmbed) =>
            msg.reply({ embeds: [embed] }).then((m) => deleter.add(m, 120000))
          );
          break;
        }
        case "download":
        case "dl": {
          let guild = await dbManager.getGuild({ discordId: msg.guild.id });
          if (!args[1] || args[1].startsWith(guild.commandPrefix)) {
            msg
              .reply(
                `Please provide a command without **ohne "${guild.commandPrefix}"**`
              )
              .then((m) => deleter.add(m, 60000));
            return;
          }
          let commandString = args[1].trim();
          let sound = await dbManager.getSound({
            guild,
            command: commandString,
          });
          if (!sound) {
            msg
              .reply(`No sound with the command **${commandString}** found.`)
              .then((m) => deleter.add(m, 60000));
            return;
          }

          let stream = dbManager.getFileStream(sound.file._id);
          let file = await dbManager.getFile(sound.file._id);
          console.log(file);
          let attachment = new MessageAttachment(stream, file.filename);
          msg
            .reply({
              content: `Here is your file :smirk:`,
              files: [attachment],
            })
            .then((m) => deleter.add(m, 60000));
        }
        case "debug":
          log.debug(msg.client.guilds.cache[0]);
          break;
        // case "migrate": {
        //   if (msg.author.id !== process.env.BOT_OWNER) {
        //     return;
        //   }

        //   let allSounds = await dbManager.getSounds({});
        //   for (const sound of allSounds) {
        //     if (!sound.filename) {
        //       sound.filename = undefined;
        //       sound.update();
        //     }
        //     continue;

        //     if (sound.file || !sound.filename) {
        //       log.warn(`sound "${sound.command}" not matching`);
        //       continue;
        //     }

        //     let filename = sound.filename;
        //     log.debug("filename created");
        //     let filepath = `${path.dirname(
        //       require.main.filename
        //     )}/sounds/${filename}`;
        //     log.debug("filepath created");
        //     let readstream = fs.createReadStream(filepath);
        //     log.debug("readstream created");
        //     let file = await dbManager.storeFile(
        //       { filename: sound.filename },
        //       readstream
        //     );
        //     log.debug("db-file created");
        //     if (!file) {
        //       log.error(`Could not save File ${filename}`);
        //       continue;
        //     }

        //     sound.file = new dbManager.mongoose.Types.ObjectId(file._id);
        //     log.debug("sound.file set");
        //     // sound.filename = undefined;
        //     // log.debug("sound.filename unset");
        //     try {
        //       await sound.save();
        //     } catch (e) {
        //       log.error("Can't save sound");
        //       log.error(e);
        //       file.unlink(() => {});
        //       continue;
        //     }
        //     log.debug("sound saved");
        //     fs.unlink(filepath, () => {});
        //     log.debug("file deleted");
        //   }
        //   break;
        // }
        case "help":
        case "hilfe": {
          let guild = await dbManager.getGuild({ discordId: msg.guild.id });
          let commandPrefix = guild.commandPrefix;
          let embed = new MessageEmbed();
          embed.setTitle("-> Click here for more information <-");
          embed.setURL(process.env.BASE_URL);
          embed.setDescription(
            "**Here you can find all commands with a short description** :blush: "
          );
          embed.setColor("ORANGE");

          // sound
          embed.addField(
            `${commandPrefix}<Sound>`,
            `Makes me play the <Sound>. You can see all commands by sending ${commandPrefix}commands .`
          );

          // random
          embed.addField(
            `${commandPrefix}random`,
            `Makes me play a random sound.`
          );

          // commands
          embed.addField(
            `${commandPrefix}commands`,
            `Makes me show all sound commands, that are available on the server`
          );

          // download
          embed.addField(
            `${commandPrefix}download <Sound>`,
            `Makes me send you the audiofile of <Sound>. <Sound> is a sound command wihtout the "${commandPrefix}"`
          );

          // help
          embed.addField(`${commandPrefix}help`, `Wow.... :smirk:`);

          embed.setFooter(
            'If you send me ad DM with "help", I will tell you, what you can do there.'
          );

          msg.reply({ embeds: [embed] }).then((m) => deleter.add(m));

          break;
        }
        case "random": {
          deleter.add(msg, 2000);
          let guild = await dbManager.getGuild({ discordId: msg.guild.id });
          let sound = await dbManager.getRandomSoundForGuild(guild._id);
          log.debug(sound[0]);
          // let sound = await dbManager.getSound({ command: args[0], guild: guild });
          audioManager.playSound(sound[0], msg, args);
          break;
        }
        default:
          deleter.add(msg, 2000);
          let guild = await dbManager.getGuild({ discordId: msg.guild.id });
          let sound = await dbManager.getSound({
            command: args[0],
            guild: guild,
          });
          audioManager.playSound(sound, msg, args);
      }
    } else if (msg.channel.type === "DM") {
      let activeConversation = Conversation.checkUserConversation(
        msg.author.id
      );
      if (activeConversation) {
        activeConversation.trigger(msg);
        return;
      }

      let args = msg.content.split(" ");
      if (args[0].startsWith("!")) {
        args[0] = args[0].substr(1);
      }

      switch (args[0]) {
        case "help":
        case "hilfe": {
          let embed = new MessageEmbed();
          embed.setTitle("-> Click here for more information <-");
          embed.setURL(process.env.BASE_URL);
          embed.setDescription(
            "**Here you can find all commands with a short description** :blush: "
          );
          embed.setColor("ORANGE");

          // upload
          embed.addField(
            `upload`,
            "Starts the process to create a new sound command for a server. Just follow the instructions"
          );

          // remove
          embed.addField(
            `remove`,
            "Starts the process to delete a sound command from a server."
          );

          // joinsound
          embed.addField(
            `joinsound`,
            "Starts the process to set your join-sound for a server"
          );

          //joinsounddelete
          embed.addField(
            `joinsounddelete`,
            "Starts the process to disable your join-sound for a server"
          );

          //help
          embed.addField(`help`, `Self-explanatory :smirk:`);

          msg.reply({ embeds: [embed] });
          break;
        }
        case "ul":
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
          let actionStack: Action<ActionResultType>[] = [
            {
              title: "Server",
              async message(conv) {
                let intersectingGuilds =
                  await MessageHandler.getIntersectingGuildsOfAuthor(
                    msg.author
                  );

                let embeds = MessageHandler.createEmbeds(
                  intersectingGuilds,
                  (guild, i) => {
                    return ["Nr. " + (i + 1), guild.name];
                  },
                  (embed, i) => {
                    embed.setDescription(
                      "**For which server do you want to change this setting?**\n(Please state the number)"
                    );
                    embed.addField("\u200b", "\u200b");
                    embed.setColor("ORANGE");
                  }
                );

                return { options: { embeds: embeds } } as MessagePayload;
              },
              async acceptedAnswers(message, conv) {
                let number = parseInt(message.content.trim());
                if (isNaN(number)) {
                  return;
                }
                let intersectingGuilds =
                  await MessageHandler.getIntersectingGuildsOfAuthor(
                    msg.author
                  );
                if (number > intersectingGuilds.length || number < 1) {
                  return;
                }
                return intersectingGuilds[number - 1];
              },
            } as Action<Guild>,
            {
              title: "Befehl",
              async message(conv) {
                let guild = await dbManager.getGuild({
                  discordId: (conv.actionStack[0].result as Guild).id,
                });
                let _id = guild.joinSounds.get(conv.triggerMessage.author.id);
                let currentCommand = await dbManager.getSound({ _id });
                log.debug(currentCommand);

                let message = "";
                if (!!currentCommand) {
                  message += `The current command for this server is **${guild.commandPrefix}${currentCommand.command}**\n`;
                } else {
                  message += "No command is currently set for this server\n";
                }
                message += `Write me the command **without "${guild.commandPrefix}"** at the beginning`;
                log.debug(message);
                return message;
              },
              async acceptedAnswers(message, conv) {
                let guild = await dbManager.getGuild({
                  discordId: (conv.actionStack[0].result as Guild).id,
                });
                let sounds = await dbManager.getAllGuildSounds(guild);

                for (const sound of sounds) {
                  if (sound.command === message.content.trim()) {
                    return sound;
                  }
                }
                return false;
              },
            } as Action<ISound>,
          ];
          let conversation = new Conversation(
            msg,
            actionStack,
            600000 /* 10 min = 600000 */,
            async (conv) => {
              // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
              let guild = await dbManager.getGuild({
                discordId: conv.actionStack[0].result.id,
              });
              guild.joinSounds.set(
                conv.triggerMessage.author.id,
                conv.actionStack[1].result
              );
              await guild.save();
            },
            () => log.warn("conversation error")
          );
          conversation.sendNextCallToAction();
          break;
        case "hilfe":
        case "help":
          msg.reply("Work in progress :)");
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
        } else {
          msg.reply("**No valid audio file**");
          let messages = await stackItem.message(conversation);
          if (Array.isArray(messages)) {
            messages.forEach((message) => msg.reply(message));
          } else {
            msg.reply(messages);
          }
          conversation.abort();
        }
      }
      return;
    }
  }

  startJoinSoundDeleteConv(msg: Message) {
    let conv = new Conversation(
      msg,
      [
        {
          title: "Server",
          async message(conv) {
            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);

            let embeds = MessageHandler.createEmbeds(
              intersectingGuilds,
              (guild, i) => {
                return ["Nr. " + (i + 1), guild.name];
              },
              (embed, i) => {
                embed.setDescription(
                  "**Server list:**\nFor which server do you want to deactivate your join sound? **(Please state the number)**"
                );
                embed.addField("\u200b", "\u200b");
                embed.setColor("ORANGE");
              }
            );

            return { options: { embeds: embeds } } as MessagePayload;
          },
          async acceptedAnswers(message, conv) {
            let number = parseInt(message.content.trim());
            if (isNaN(number)) {
              return;
            }
            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
            if (number > intersectingGuilds.length || number < 1) {
              return;
            }
            return intersectingGuilds[number - 1];
          },
        } as Action<Guild>,
      ],
      600000,
      async (conv) => {
        let guild = await dbManager.getGuild({
          discordId: conv.actionStack[0].result.id,
        });
        guild.joinSounds.delete(conv.triggerMessage.author.id);
        await guild.save();
      },
      () => {}
    );
    return conv;
  }

  startSoundDeleteConv(msg) {
    let conv = new Conversation(
      msg,
      [
        {
          title: "Server",
          async message(conv) {
            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);

            let relevantGuilds = [];
            for (let guild of intersectingGuilds) {
              let member;
              try {
                member = await guild.members.fetch(msg.author);
              } catch (err) {
                log.error("Member not found");
              }

              if (member && member.hasPermission("ADMINISTRATOR")) {
                relevantGuilds.push(guild);
                continue;
              }
              let dbGuild = await dbManager.getGuild({ discordId: guild.id });
              let dbUser = await dbManager.getUser({
                discordId: msg.author.id,
              });
              let soundCount = await SoundModel.count({
                guild: dbGuild,
                creator: dbUser.id,
              }).exec();
              if (soundCount > 0) {
                relevantGuilds.push(guild);
              }
            }

            if (relevantGuilds.length === 0) {
              msg.reply(
                "There are no servers on which you can delete commands"
              );
              conv.abort();
              return;
            }

            let embeds = MessageHandler.createEmbeds(
              relevantGuilds,
              (guild, i) => {
                return ["Nr. " + (i + 1), guild.name];
              },
              (embed, i) => {
                embed.setDescription(
                  "**Server list:**\nFrom which server should a command be deleted? **(Please state the number)**"
                );
                embed.addField("\u200b", "\u200b");
                embed.setColor("ORANGE");
              }
            );

            return { options: { embeds: embeds } } as MessagePayload;
          },
          async acceptedAnswers(message, conv) {
            let number = parseInt(message.content.trim());
            if (isNaN(number)) {
              return false;
            }

            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);

            let relevantGuilds = [];
            for (let guild of intersectingGuilds) {
              let member = await guild.members.fetch(msg.author);
              if (member.permissions.has("ADMINISTRATOR")) {
                relevantGuilds.push(guild);
                continue;
              }
              let dbGuild = await dbManager.getGuild({ discordId: guild.id });
              let dbUser = await dbManager.getUser({
                discordId: msg.author.id,
              });
              let soundCount = await SoundModel.count({
                guild: dbGuild,
                creator: dbUser.id,
              }).exec();
              if (soundCount > 0) {
                relevantGuilds.push(guild);
              }
            }

            if (number > relevantGuilds.length || number < 1) {
              return false;
            }
            return relevantGuilds[number - 1];
          },
        } as Action<Guild>,
        {
          title: "Command",
          async message(conv) {
            let member;
            try {
              member = await (
                conv.actionStack[0].result as Guild
              ).members.fetch(msg.author);
            } catch (err) {
              log.error("Member not found");
            }
            let guild = await dbManager.getGuild({
              discordId: (conv.actionStack[0].result as Guild).id,
            });
            console.debug(`guild: ${guild}`);

            let relevantSounds = [];

            if (member.hasPermission("ADMINISTRATOR")) {
              relevantSounds = await dbManager.getAllGuildSounds(guild);
            } else {
              let dbUser = await dbManager.getUser({ discordId: member.id });
              relevantSounds = await dbManager.getSounds({
                guild,
                creator: dbUser,
              });
            }

            if (relevantSounds.length === 0) {
              msg.reply("There are no commands to delete...");
              conv.abort();
              return;
            }
            let embeds = MessageHandler.createEmbeds(
              relevantSounds,
              (sound, i) => {
                return [guild.commandPrefix + sound.command, sound.description];
              },
              (embed, i) => {
                embed.setDescription(
                  'The following audio commands can be deleted: Please tell me the command **without "' +
                    guild.commandPrefix +
                    '"** '
                );
                embed.setColor("ORANGE");
              }
            );
            return { options: { embeds: embeds } } as MessagePayload;
          },
          async acceptedAnswers(message, conv) {
            let member;
            try {
              member = await (
                conv.actionStack[0].result as Guild
              ).members.fetch(msg.author);
            } catch (err) {
              log.error("Member not found");
            }
            let dbGuild = await dbManager.getGuild({
              discordId: (conv.actionStack[0].result as Guild).id,
            });
            let sound = await dbManager.getSound({
              guild: dbGuild,
              command: message.content.trim(),
            });

            if (!sound) {
              return;
            }

            if (!member) {
              return;
            }

            if (member.hasPermission("ADMINISTRATOR")) {
              return sound;
            }
            let dbUser = await dbManager.getUser({ discordId: member.id });
            return dbUser._id.equals(sound.creator) ? sound : undefined;
          },
        } as Action<ISound>,
      ],
      600000,
      async (conv) => {
        await dbManager.unlinkFile(conv.actionStack[1].result.file);
        conv.actionStack[1].result.delete();
      },
      () => {}
    );
    return conv;
  }

  startSoundUploadConv(msg) {
    let conv = new Conversation(
      msg,
      [
        {
          title: "Server",
          async message(conv) {
            log.debug(msg.author);

            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);

            let embeds = MessageHandler.createEmbeds(
              intersectingGuilds,
              (guild, i) => {
                return ["Nr. " + (i + 1), guild.name];
              },
              (embed, i) => {
                embed.setDescription(
                  "**Server list:**\nFor which of the following servers do you want to create the command? **(Please state the number)**"
                );
                embed.addField("\u200b", "\u200b");
                embed.setColor("ORANGE");
              }
            );

            return { options: { embeds: embeds } } as MessagePayload;
          },
          async acceptedAnswers(message, conv) {
            let number = parseInt(message.content.trim());
            if (isNaN(number)) {
              return;
            }
            let intersectingGuilds =
              await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);
            if (number > intersectingGuilds.length || number < 1) {
              return;
            }
            return intersectingGuilds[number - 1];
          },
        },
        {
          title: "Command",
          async message(conv) {
            let guild = await dbManager.getGuild({
              discordId: (conv.actionStack[0].result as Guild).id,
            });
            return `Please enter the command you want to use to play the file later (without the "${guild.commandPrefix}" in the beginning)\n**(Between 3 and 15 Characters)**`;
          },
          async acceptedAnswers(message, conv) {
            let command = message.content.trim();
            let guild = await dbManager.getGuild({
              discordId: (conv.actionStack[0].result as Guild).id,
            });
            const isSoundIllegal = await SoundManager.isCommandIllegal(
              command,
              guild
            );
            if (!!isSoundIllegal) {
              log.warn(isSoundIllegal);
              return;
            }
            return command;
          },
        },
        {
          title: "Description",
          async message(conv) {
            return "Please enter a short description for the command\n**(Between 3 and 40 Characters)**";
          },
          async acceptedAnswers(message, conv) {
            const descriptionIllegal = SoundManager.isDescriptionIllegal(
              message.content
            );
            if (!!descriptionIllegal) {
              log.warn(descriptionIllegal);
              return;
            }
            return message.content;
          },
        },
        {
          title: "Audio File",
          async message(conv): Promise<string> {
            return "Please send me an audio file in **MP3** or **FLAC** format.\nThe file can not be larger than 1MB and not longer than 30 seconds.";
          },
          async acceptedAnswers(message, conv) {
            if (message.attachments.size === 0) {
              log.warn("no attachments");
              return;
            }
            let att = message.attachments.first();

            const soundManager = new SoundManager();
            if (!soundManager.checkFileSize(att.size)) {
              log.warn("too big");
              return;
            }

            if (!soundManager.checkFileExtension(att.name)) {
              log.warn(`wrong format`);
              return;
            }

            let resp = await request("GET", att.url);

            if (!soundManager.checkFileMetadata(resp.content)) {
              return;
            }

            const filename = soundManager.createUniqueFilename(att.name);

            const file = await soundManager.storeFile(resp.content);

            return {
              filename,
              oldFilename: att.name,
              dbFile: file,
              soundManager: soundManager,
            } as ISoundResultData;
          },
          revert(conv, action) {
            if (!action.result) {
              return;
            }
            (action.result as ISoundResultData).dbFile.unlink((err) => {
              if (err) log.error(err);
            });
            // dbManager.unlinkFile(action.result.dbFile._id);
            // fs.unlink(`${path.dirname(require.main.filename)}/sounds/${action.result.filename}`, (err) => { });
          },
        },
      ],
      600000 /* 10 min = 600000 */,
      async (conv) => {
        // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
        const guild = await dbManager.getGuild({
          discordId: conv.actionStack[0].result.id,
        });
        const creator = await dbManager.getUser({
          discordId: conv.triggerMessage.author.id,
        });
        const command = conv.actionStack[1].result;
        const description = conv.actionStack[2].result;

        const soundManager = conv.actionStack[3].result.soundManager;

        try {
          await soundManager.createSound(command, description, guild, creator);
        } catch (e) {
          log.error(e);
          soundManager.soundFile.unlink((err) => {
            if (err) log.error(err);
          });
        }
      },
      () => log.warn("conversation error")
    );
    return conv;
  }

  static createEmbeds<T>(
    list: T[],
    itemToTtleAndDescription: (item: T, index: number) => [string, string],
    modifyEmbed: (embed: MessageEmbed, index: number) => void
  ): MessageEmbed[] {
    let embeds: MessageEmbed[] = [];
    embeds.push(new MessageEmbed());

    for (let i = 0; i < list.length; i++) {
      let [title, description] = itemToTtleAndDescription(list[i], i);
      let embed = embeds[embeds.length - 1];

      if (
        embed.fields.length >= 25 ||
        embed.length + title.length + description.length >= 6000
      ) {
        embeds.push(new MessageEmbed());
        embed = embeds[embeds.length - 1];
      }

      embed.addField(title, description, true);
    }

    embeds.forEach((embed, i) => {
      let sum = embeds.length;
      modifyEmbed(embed, i);
      if (embeds.length > 1) {
        embed.setDescription(
          embed.description +
            (sum > 1 ? "\nPage(" + (i + 1) + "/" + sum + ")" : "")
        );
      }
    });
    return embeds;
  }

  static async getIntersectingGuildsOfAuthor(author: User): Promise<Guild[]> {
    let intersectingGuilds: Guild[] = [];
    for (let [guildId, guild] of author.client.guilds.cache) {
      try {
        let member = await guild.members.fetch(author);
        if (member) {
          intersectingGuilds.push(guild);
        }
      } catch (err) {
        log.error("Member not found");
      }
    }
    return intersectingGuilds;
  }
}

export interface ISoundResultData {
  filename: string;
  oldFilename: string;
  dbFile: MongooseGridFSFileModel;
  soundManager: SoundManager;
}
