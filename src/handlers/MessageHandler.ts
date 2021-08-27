import MessageDeleter from "../MessageDeleter";
import {
  MessageEmbed,
  MessageAttachment,
  Client,
  Guild,
  Message,
  User,
  MessagePayload,
  VoiceChannel,
  EmbedField,
  MessageActionRow,
  MessageSelectMenu,
  GuildMember,
} from "discord.js";
import Conversation, { Action, QuestionInteractionType } from "../Conversation";
import fs from "fs";
import request from "http-async";
import path from "path";
import util from "util";
import log from "../log";
import Sound from "../db/models/Sound";
import SoundModel from "../db/models/Sound";
import IGuild from "../db/interfaces/IGuild";
import ISound from "../db/interfaces/ISound";
import { MongooseGridFSFileModel } from "mongoose-gridfs";
import { MembershipStates } from "discord.js/typings/enums";
import { GroupPermission } from "../db/models/Guild";
import MultiPageMessage, {
  MultiPageMessageOfFieldsOptions,
} from "../MultiPageMessage";
import AudioManager from "../managers/AudioManager";
import DatabaseManager from "../managers/DatabaseManager";
import SoundManager from "../managers/SoundManager";
import DatabaseGuildManager from "../managers/DatabaseGuildManager";

const dbManager = DatabaseManager.getInstance();
const audioManager = new AudioManager();
const deleter = MessageDeleter.getInstance();

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
    this.bot.on("messageCreate", (message) => {
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
        case "commands":
          {
            let dbGuild: IGuild = await dbManager.getGuild({
              discordId: msg.guild.id,
            });

            SoundManager.sendCommandsList(msg.channel, msg.channel, dbGuild);
          }
          break;
        case "random":
          {
            deleter.add(msg, 2000);
            let guild = await dbManager.getGuild({ discordId: msg.guild.id });
            let sound = await dbManager.getRandomSoundForGuild(guild._id);

            if (!sound) {
              break;
            }

            audioManager.memberPlaySound(
              msg.member,
              sound[0],
              msg.member.voice.channel as VoiceChannel
            );
          }
          break;
        default:
          deleter.add(msg, 2000);
          let guild = await dbManager.getGuild({ discordId: msg.guild.id });
          let sound = await dbManager.getSound({
            command: args[0],
            guild: guild,
          });

          if (!sound) {
            break;
          }

          audioManager.memberPlaySound(
            msg.member,
            sound,
            msg.member.voice.channel as VoiceChannel
          );
      }
    } else if (msg.channel.type === "DM") {
      return;
      let activeConversation = Conversation.checkUserConversation(
        msg.author.id
      );
      if (activeConversation) {
        activeConversation.start();
        return;
      }

      let args = msg.content.split(" ");
      if (args[0].startsWith("!")) {
        args[0] = args[0].substr(1);
      }

      switch (args[0]) {
        case "ul":
        case "upload":
          {
            let conv = this.startSoundUploadConv(msg);
            conv?.sendNextCallToAction();
          }
          break;
        case "joindelete":
        case "joinsounddelete":
          {
            let conv = this.startJoinSoundDeleteConv(msg);
            conv?.sendNextCallToAction();
          }
          break;
        case "remove":
        case "delete":
          {
            let conv = this.startSoundDeleteConv(msg);
            conv?.sendNextCallToAction();
          }
          break;
        case "joinsound":
        case "join":
          {
            const conv = this.startJoinSoundCreateConv(msg);
            conv?.start();
          }
          break;
        case "hilfe":
        case "help":
          msg.reply("Work in progress :)");
          break;
        case "perm":
          {
            let conv = this.startPermissionGroupCreateConv(msg);
            conv?.start();
          }
          break;
        case "permdel":
          {
            const conv = this.startPermissionGroupDeleteConv(msg);
            conv?.start();
          }
          break;
        default: {
          if (!Conversation.activeConversations.has(msg.author.id)) {
            let embed = new MessageEmbed();
            embed.setTitle("-> Click here for more information <-");
            embed.setURL(process.env.BASE_URL);
            embed.setDescription(
              "**Here you can find all commands with a short description** :blush: "
            );

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

            //perm
            embed.addField(
              `perm`,
              "Starts the process to create a permission group for a server"
            );

            //permdel
            embed.addField(
              `permdel`,
              "Starts the process to delete a permission group for a server"
            );
            msg.reply({ embeds: [embed] });
          }
        }
      }

      if (msg.attachments.size > 0) {
        let conversation = this.startSoundUploadConv(msg);
        let stackItem = conversation.actionStack[3];
        const verifiedResult = stackItem.setResult(msg.attachments.first());
      }
      return;
    }
  }

  startJoinSoundCreateConv(msg: Message): Conversation {
    const conv = Conversation.createConversation(
      "Create Join Sound",
      msg,
      600000,
      async (conv) => {
        const guild = conv.actionStack[0].options.result as Guild;
        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });
        const dbGuildManager = new DatabaseGuildManager(dbGuild);
        let member;
        try {
          member = guild.members.cache.get(msg.author.id);
        } catch (err) {
          log.error("Member not found");
          msg.channel.send("I couldn't find you in the server");
          conv.abort();
          return;
        }

        if (!(await dbGuildManager.canUseJoinSound(member))) {
          msg.channel.send(
            "You are not allowed to use join sounds on this server"
          );
          conv.abort();
          return;
        }
        dbGuild.joinSounds.set(
          conv.triggerMessage.author.id,
          (conv.actionStack[1].options.result as ISound).id
        );
        await dbGuild.save();
      },
      () => log.warn("conversation error")
    );

    conv.addActions([
      MessageHandler.getServerAction(conv),
      new Action<ISound>({
        title: "Command",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          let dbGuild = await dbManager.getGuild({
            discordId: (conv.actionStack[0].options.result as Guild).id,
          });
          let _id = dbGuild.joinSounds.get(conv.triggerMessage.author.id);
          let currentCommand = await dbManager.getSound({ _id });
          log.debug(currentCommand);

          const relevantSounds = await dbManager.getAllGuildSounds(dbGuild);

          const messagePayload =
            MultiPageMessage.createMultipageMessageOfFields(
              new MultiPageMessageOfFieldsOptions({
                channel: msg.channel,
                title: "Commands",
                description:
                  "The commands of the selected server.\n" +
                  (!!currentCommand
                    ? `Your current selected commands is **${dbGuild.commandPrefix}${currentCommand.command}**`
                    : ""),
                fields: relevantSounds.map((g, i) => ({
                  name: `${dbGuild.commandPrefix}${g.command}`,
                  value: g.description,
                  inline: true,
                })),
                withSelectMenu: true,
                fieldToUseForSelectValue: "name",
              })
            );

          return messagePayload;
        },
        resultToString(conv, result) {
          return result.command;
        },
        async idToResult(conv, id) {
          return SoundModel.findOne({
            command: id.substring(1),
            guild: await dbManager.getGuild({
              discordId: (conv.actionStack[0].options.result as Guild).id,
            }),
          }).exec();
        },
      }),
    ]);
    return conv;
  }

  startJoinSoundDeleteConv(msg: Message) {
    const conv = Conversation.createConversation(
      "Delete Join Sound",
      msg,
      600000,
      async (conv) => {
        let dbGuild = await dbManager.getGuild({
          discordId: (conv.actionStack[0].options.result as Guild).id,
        });
        dbGuild.joinSounds.delete(conv.triggerMessage.author.id);
        await dbGuild.save();
      },
      () => {}
    );
    conv?.addActions([MessageHandler.getServerAction(conv)]);
    return conv;
  }

  startSoundDeleteConv(msg) {
    const conv = Conversation.createConversation(
      "Delete Sound",
      msg,
      600000,
      async (conv) => {
        const sound = conv.actionStack[1].options.result as ISound;
        await dbManager.unlinkFile(sound.file);
        sound.delete();
      },
      () => {}
    );
    conv?.addActions([
      new Action<Guild>({
        title: "Server",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          let intersectingGuilds =
            await MessageHandler.getIntersectingGuildsOfAuthor(msg.author);

          let relevantGuilds = [];
          for (let guild of intersectingGuilds) {
            let member: GuildMember;
            try {
              member = guild.members.cache.get(msg.author.id);
            } catch (err) {
              log.error("Member not found");
              msg.channel.send("I couldn't find you in the server");
              conv.abort();
              return;
            }

            if (member && member.permissions.has("ADMINISTRATOR")) {
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
            msg.reply("There are no servers on which you can delete commands");
            conv.abort();
            return;
          }

          const messagePayload =
            MultiPageMessage.createMultipageMessageOfFields(
              new MultiPageMessageOfFieldsOptions({
                channel: msg.channel,
                title: "Servers",
                description: "The servers, that you and the bot are in",
                fields: relevantGuilds.map((g, i) => ({
                  name: g.name,
                  value: g.id,
                  inline: true,
                })),
              })
            );

          return messagePayload;
        },
        resultToString(conv, response) {
          return response.name;
        },
        async idToResult(conv, id) {
          return this.bot.guilds.cache.get(id);
        },
      }),
      new Action<ISound>({
        title: "Command",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          const guild = conv.actionStack[0].options.result as Guild;
          let member;
          try {
            member = guild.members.cache.get(msg.author.id);
          } catch (err) {
            log.error("Member not found");
            msg.channel.send("I couldn't find you in the server");
            conv.abort();
            return;
          }
          let dbGuild = await dbManager.getGuild({
            discordId: guild.id,
          });
          console.debug(`guild: ${dbGuild}`);

          let relevantSounds = [];

          if (member.hasPermission("ADMINISTRATOR")) {
            relevantSounds = await dbManager.getAllGuildSounds(dbGuild);
          } else {
            let dbUser = await dbManager.getUser({ discordId: member.id });
            relevantSounds = await dbManager.getSounds({
              guild: dbGuild,
              creator: dbUser,
            });
          }

          if (relevantSounds.length === 0) {
            msg.reply("There are no commands to delete...");
            conv.abort();
            return;
          }
          const messagePayload =
            MultiPageMessage.createMultipageMessageOfFields(
              new MultiPageMessageOfFieldsOptions({
                channel: msg.channel,
                title: "Commands",
                description: "Commands of the selected server",
                fields: relevantSounds.map((g, i) => ({
                  name: `${dbGuild.commandPrefix}${g.command}`,
                  value: g.description,
                  inline: true,
                })),
                withSelectMenu: true,
                fieldToUseForSelectValue: "name",
              })
            );

          return messagePayload;
        },
        resultToString(conv, response) {
          return response.command;
        },
        async idToResult(conv, id) {
          return SoundModel.findOne({
            command: id.substring(1),
            guild: await dbManager.getGuild({
              discordId: (conv.actionStack[0].options.result as Guild).id,
            }),
          }).exec();
        },
      }),
    ]);
    return conv;
  }

  startPermissionGroupDeleteConv(msg: Message) {
    const conv = Conversation.createConversation(
      "Delete Permission Group",
      msg,
      600000,
      async (conv) => {
        const guild = conv.actionStack[0].options.result as Guild;
        let member;
        try {
          member = guild.members.cache.get(msg.author.id);
        } catch (err) {
          log.error("Member not found");
          msg.channel.send("I couldn't find you in the server");
          conv.abort();
          return;
        }
        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });

        const dbGuildManager = new DatabaseGuildManager(dbGuild);

        if (!(await dbGuildManager.canManageGroups(member))) {
          msg.channel.send("You are not allowed to manage groups");
          conv.abort();
          return;
        }

        const permissionNames = (
          conv.actionStack[1].options.result as string
        ).split("#");

        dbGuild.permissionGroups.remove(
          dbGuild.permissionGroups
            .filter((g) => permissionNames.includes(g.name))
            .map((g) => g.id)
        );

        await dbGuild.save();
      },
      () => {}
    );
    conv?.addActions([
      MessageHandler.getServerAction(conv),

      new Action<string>({
        title: "Permission Group",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          const guild = conv.actionStack[0].options.result as Guild;
          const dbGuild = await dbManager.getGuild({ discordId: guild.id });

          return MultiPageMessage.createMultipageMessageOfFields(
            new MultiPageMessageOfFieldsOptions({
              channel: conv.triggerMessage.channel,
              title: "Permission groups",
              description: `The permission groups of the server ${guild.name}`,
              fields: dbGuild.permissionGroups.map(
                (g, i) =>
                  ({
                    name: `Group ${i + 1}`,
                    value: g.name,
                    inline: true,
                  } as EmbedField)
              ),
              fieldToUseForSelectValue: "value",
              maxSelectValueOfOne: false,
            })
          );
        },
        resultToString(conv, result) {
          return result.split("#").join(", ");
        },
      }),
    ]);
    return conv;
  }

  startPermissionGroupAddRoleConv(msg: Message) {
    const conv = Conversation.createConversation(
      "Add Role To Permission Group",
      msg,
      600000,
      async (conv) => {
        const guild = conv.actionStack[0].options.result as Guild;
        let member;
        try {
          member = guild.members.cache.get(msg.author.id);
        } catch (err) {
          log.error("Member not found");
          msg.channel.send("I couldn't find you in the server");
          conv.abort();
          return;
        }
        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });

        const dbGuildManager = new DatabaseGuildManager(dbGuild);

        if (!(await dbGuildManager.canManageGroups(member))) {
          msg.channel.send("You are not allowed to manage groups");
          conv.abort();
          return;
        }

        const permissionNames = (
          conv.actionStack[1].options.result as string
        ).split("#");

        dbGuild.permissionGroups.remove(
          dbGuild.permissionGroups
            .filter((g) => permissionNames.includes(g.name))
            .map((g) => g.id)
        );

        await dbGuild.save();
      },
      () => {}
    );
    conv?.addActions([
      MessageHandler.getServerAction(conv),

      new Action<string>({
        title: "Permission Group",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          const guild = conv.actionStack[0].options.result as Guild;
          const dbGuild = await dbManager.getGuild({ discordId: guild.id });

          return MultiPageMessage.createMultipageMessageOfFields(
            new MultiPageMessageOfFieldsOptions({
              channel: conv.triggerMessage.channel,
              title: "Permission groups",
              description: `The permission groups of the server ${guild.name}`,
              fields: dbGuild.permissionGroups.map(
                (g, i) =>
                  ({
                    name: `Group ${i + 1}`,
                    value: g.name,
                    inline: true,
                  } as EmbedField)
              ),
              fieldToUseForSelectValue: "value",
              maxSelectValueOfOne: false,
            })
          );
        },
        resultToString(conv, result) {
          return result.split("#").join(", ");
        },
      }),
    ]);
    return conv;
  }

  startPermissionGroupCreateConv(msg: Message) {
    const conv = Conversation.createConversation(
      "Create Permission Group",
      msg,
      600000,
      async (conv) => {
        const guild = conv.actionStack[0].options.result as Guild;
        let member;
        try {
          member = guild.members.cache.get(msg.author.id);
        } catch (err) {
          log.error("Member not found");
          msg.channel.send("I couldn't find you in the server");
          conv.abort();
          return;
        }
        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });
        const dbGuildManager = new DatabaseGuildManager(dbGuild);

        if (!(await dbGuildManager.canManageGroups(member))) {
          msg.channel.send("You are not allowed to manage groups");
          conv.abort();
          return;
        }

        dbGuild.permissionGroups.push({
          name: conv.actionStack[1].options.result as string,
          maxSoundDuration: parseInt(
            conv.actionStack[2].options.result as string
          ),
          maxSoundsPerUser: parseInt(
            conv.actionStack[3].options.result as string
          ),
          discordRoles: (conv.actionStack[4].options.result as string).split(
            /[^0-9]+/
          ),
          permissions: (conv.actionStack[5].options.result as string).split(
            "#"
          ),
        });
        await dbGuild.save();
      },
      () => {}
    );
    conv?.addActions([
      MessageHandler.getServerAction(conv),
      new Action<string>({
        title: "Name",
        conv,
        interactionType: QuestionInteractionType.MESSAGE,
        async message(conv) {
          return {
            content: "Please write me the name of the new permission group",
          };
        },
        resultToString(conv, result) {
          return result;
        },
        async verifyResponse(conv, result) {
          return true;
        },
      }),
      new Action<string>({
        title: "Max Sound Duration",
        conv,
        interactionType: QuestionInteractionType.MESSAGE,
        async message(conv) {
          return {
            content: "Please write me the max duration of a sound in seconds",
          };
        },
        resultToString(conv, result) {
          return result;
        },
        async verifyResponse(conv, result) {
          if (isNaN(parseInt(result, 10))) {
            return "This input is not an integer";
          }
          return true;
        },
      }),
      new Action<string>({
        title: "Max Sounds Per User",
        conv,
        interactionType: QuestionInteractionType.MESSAGE,
        async message(conv) {
          return {
            content: "Please write me the max amount of sounds per user",
          };
        },
        resultToString(conv, result) {
          return result;
        },
        async verifyResponse(conv, result) {
          if (isNaN(parseInt(result, 10))) {
            return "This input is not an integer";
          }
          return true;
        },
      }),
      MessageHandler.getRoleAction(conv),

      new Action<string>({
        title: "Permissions",
        conv,
        interactionType: QuestionInteractionType.SELECT,
        async message(conv) {
          return {
            embeds: [
              {
                title: "Permissions",
                description:
                  "Please select the permissions that should be given to the new permission group",
                fields: Object.keys(GroupPermission).map((key) => ({
                  name: key,
                  value: GroupPermission[key],
                })),
              },
            ],
            components: [
              new MessageActionRow().addComponents([
                new MessageSelectMenu()
                  .setCustomId("select-permissions")
                  .setPlaceholder("Select permissions...")
                  .setMaxValues(Object.keys(GroupPermission).length)
                  .addOptions(
                    Object.keys(GroupPermission).map((key) => ({
                      label: key,
                      value: key,
                    }))
                  ),
              ]),
            ],
          };
        },
        resultToString(conv, result) {
          return result.split("#").join("   ");
        },
      }),
    ]);
    return conv;
  }

  startSoundUploadConv(msg) {
    const conv = Conversation.createConversation(
      "Upload Sound",
      msg,
      600000 /* 10 min = 600000 */,
      async (conv) => {
        // let guild = Guild.model.findOne({discordId: conv.actionStack[1].id});
        const guild = conv.actionStack[0].options.result as Guild;
        let member;
        try {
          member = guild.members.cache.get(msg.author.id);
        } catch (err) {
          log.error("Member not found");
          msg.channel.send("I couldn't find you in the server");
          conv.abort();
          return;
        }
        const dbGuild = await dbManager.getGuild({
          discordId: guild.id,
        });
        const creator = await dbManager.getUser({
          discordId: conv.triggerMessage.author.id,
        });
        const command = conv.actionStack[1].options.result as string;
        const description = conv.actionStack[2].options.result as string;

        const soundManager = new SoundManager(dbGuild);
        const dbGuildManager = new DatabaseGuildManager(dbGuild);

        if (!(await dbGuildManager.canAddSounds(member))) {
          msg.channel.send("You are not allowed to add sounds");
          conv.abort();
          return;
        }

        const attachment = conv.actionStack[3].options
          .result as MessageAttachment;

        const resp = await request("GET", attachment.url);

        const duration = await soundManager.getFileDuration(resp.content);

        if (!duration) {
          log.info(`Could not get medatada from file`);
          msg.channel.send("Could not get metadata from the file");
          conv.abort();
          return;
        }

        const errorReason = await soundManager.checkFilePermissions(member, {
          size: attachment.size,
          duration: duration,
          name: attachment.name,
        });

        if (errorReason) {
          log.info(
            `${member.displayName} could not save sound: ${errorReason}`
          );
          msg.channel.send(errorReason);
          conv.abort();
          return;
        }

        try {
          const filename = soundManager.createUniqueFilename(attachment.name);

          const file = await soundManager.storeFile(resp.content);

          await soundManager.createSound(
            command,
            description,
            dbGuild,
            creator
          );
        } catch (e) {
          log.error(e);
          soundManager.soundFile.unlink((err) => {
            if (err) log.error(err);
          });
        }
      },
      () => log.warn("conversation error")
    );

    conv?.addActions([
      MessageHandler.getServerAction(conv),
      new Action<string>({
        title: "Command",
        conv,
        interactionType: QuestionInteractionType.MESSAGE,
        async message(conv) {
          let guild = await dbManager.getGuild({
            discordId: (conv.actionStack[0].options.result as Guild).id,
          });
          return {
            content: `Please enter the command you want to use to play the file later (without the "${guild.commandPrefix}" in the beginning)\n**(Between 3 and 15 Characters)**`,
          };
        },
        resultToString(conv, result) {
          return result;
        },
        async verifyResponse(conv, result) {
          const dbGuild = await dbManager.getGuild({
            discordId: (conv.actionStack[0].options.result as Guild).id,
          });
          const reason = await SoundManager.isCommandIllegal(
            result as string,
            dbGuild
          );

          return reason || true;
        },
      }),
      new Action<string>({
        title: "Description",
        conv,
        interactionType: QuestionInteractionType.MESSAGE,
        async message(conv) {
          return {
            content:
              "Please enter a short description for the command\n**(Between 3 and 40 Characters)**",
          };
        },
        resultToString(conv, result) {
          return result;
        },
        async verifyResponse(conv, result) {
          const reason = await SoundManager.isDescriptionIllegal(
            result as string
          );

          return reason || true;
        },
      }),
      new Action<MessageAttachment>({
        title: "Audio File",
        conv,
        interactionType: QuestionInteractionType.FILE,
        async message(conv) {
          const guild = conv.actionStack[0].options.result as Guild;
          let member;
          try {
            member = guild.members.cache.get(msg.author.id);
          } catch (err) {
            log.error("Member not found");
            msg.channel.send("I couldn't find you in the server");
            conv.abort();
            return;
          }
          const dbGuild = await dbManager.getGuild({ discordId: guild.id });
          const dbGuildManager = new DatabaseGuildManager(dbGuild);
          return {
            content: `Please send me an audio file in **MP3** or **FLAC** format.\nThe file can not be larger than 1MB and not longer than ${dbGuildManager.getMaxSoundDurationForMember(
              member
            )} seconds.`,
          };
        },
        resultToString(conv, result) {
          return result.name;
        },
        async verifyResponse(conv, result) {
          if (!conv.actionStack[0].options.result) {
            return true;
          }
          const guild = conv.actionStack[0].options.result as Guild;
          const dbGuild = await dbManager.getGuild({ discordId: guild.id });
          const soundManager = new SoundManager(dbGuild);
          const resp = await request("GET", result.url);

          const duration = await soundManager.getFileDuration(resp.content);

          const errorReason = !!duration
            ? await soundManager.checkFilePermissions(
                guild.members.cache.get(msg.author),
                {
                  size: result.size,
                  duration: duration,
                  name: result.name,
                }
              )
            : "Could not get meta data from the file";

          return !!errorReason ? errorReason : true;
        },
      }),
    ]);

    return conv;
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

  static getServerAction(conv: Conversation): Action<Guild> {
    return new Action<Guild>({
      title: "Server",
      conv,
      interactionType: QuestionInteractionType.SELECT,
      async message(conv) {
        let intersectingGuilds =
          await MessageHandler.getIntersectingGuildsOfAuthor(
            conv.triggerMessage.author
          );

        const messagePayload = MultiPageMessage.createMultipageMessageOfFields(
          new MultiPageMessageOfFieldsOptions({
            channel: conv.triggerMessage.channel,
            title: "Servers",
            description: "The servers, that you and the bot are in",
            fields: intersectingGuilds.map((g, i) => ({
              name: g.name,
              value: g.id,
              inline: true,
            })),
          })
        );

        return messagePayload;
      },
      resultToString(conv, result) {
        return result.name;
      },
      async idToResult(conv, id) {
        return conv.triggerMessage.client.guilds.cache.get(id);
      },
    });
  }

  static getRoleAction(conv: Conversation): Action<string> {
    return new Action<string>({
      title: "Roles",
      conv,
      interactionType: QuestionInteractionType.MESSAGE,
      async message(conv) {
        return {
          content:
            "Please write me the role IDs, that are of this permission group (separated by comma and/or space).\nThe id of **@everyone** is the id of the server!",
        };
      },
      resultToString(conv, result) {
        const ids = result.split(/[^0-9]+/);
        const guild = conv.actionStack[0].options.result as Guild;
        return ids.map((id) => guild.roles.cache.get(id).name || id).join(", ");
      },
      async verifyResponse(conv, result) {
        const ids = result.split(/[^0-9]+/);
        const guild = conv.actionStack[0].options.result as Guild;
        const isValid = ids.every((id) => guild.roles.cache.has(id));
        return (
          isValid || "At least one of the given roles is not in the server"
        );
      },
    });
  }
}

export interface ISoundResultData {
  filename: string;
  oldFilename: string;
  dbFile: MongooseGridFSFileModel;
  soundManager: SoundManager;
}
