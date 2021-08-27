import {
  Collection,
  Guild,
  Message,
  MessageActionRow,
  MessageButton,
  MessageOptions,
  TextChannel,
} from "discord.js";
import ISound from "../db/interfaces/ISound";
import log from "../log";
import DatabaseManager from "./DatabaseManager";

const dbManager = DatabaseManager.getInstance();

export default class SoundBoardManager {
  private static _instances: Map<string, SoundBoardManager> = new Map();
  channel: TextChannel;
  guildId: string;

  private _setup: boolean = false;

  constructor(channel: TextChannel) {
    this.channel = channel;
    this.guildId = channel.guild.id;
    SoundBoardManager._instances.set(channel.guild.id, this);
  }

  public static getInstance(guildId: string): SoundBoardManager {
    return SoundBoardManager._instances.get(guildId);
  }

  async setup(): Promise<boolean> {
    if (this._setup) {
      return true;
    }
    if (!SoundBoardManager.checkChannelPermissions(this.channel)) {
      SoundBoardManager._instances.delete(this.guildId);
      dbManager.getGuild({ discordId: this.guildId }).then((dbGuild) => {
        dbGuild.soundBoardChannel = null;
        dbGuild.save();
      });
      return false;
    }
    await this.deleteOtherMessages();
    this.channel
      .createMessageCollector({
        filter: (message) => message.author.id !== this.channel.guild.me.id,
      })
      .on("collect", (message) => {
        message.delete().catch(() => {
          log.error(
            "Could not delete other users message in soundboard channel"
          );
        });
      });
    this._setup = true;
    return true;
  }

  static checkChannelPermissions(channel: TextChannel): boolean {
    const channelPermissions = channel.permissionsFor(channel.guild.me);
    const permissions =
      channelPermissions.has("SEND_MESSAGES") &&
      channelPermissions.has("READ_MESSAGE_HISTORY") &&
      channelPermissions.has("VIEW_CHANNEL") &&
      channelPermissions.has("MANAGE_MESSAGES");
    if (!permissions) {
      log.error("Missing permissions for soundboard channel");
    }
    return permissions;
  }

  async updateMessages() {
    log.debug("Updating soundboard messages");
    const messages = (await this.getBotMessages()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const guild = this.channel.guild;

    if (!guild) {
      return;
    }

    const dbGuild = await dbManager.getGuild({ discordId: guild.id });
    const sounds = await dbManager.getAllGuildSounds(dbGuild);
    sounds.sort((a, b) => a.command.localeCompare(b.command));
    const perChunk = 5;
    const chunks = sounds.reduce((resultArray: ISound[][], item, index) => {
      const chunkIndex = Math.floor(index / perChunk);

      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = [];
      }

      resultArray[chunkIndex].push(item);

      return resultArray;
    }, []);

    const rows: MessageActionRow[] = [];
    for (const chunk of chunks) {
      rows.push(
        new MessageActionRow().addComponents(
          chunk.map((c) => {
            const label =
              c.command + "\xa0".repeat(Math.max(16 - c.command.length, 0));
            return new MessageButton()
              .setLabel(label)
              .setStyle("SECONDARY")
              .setCustomId(`${c.command}#soundboardButton`);
          })
        )
      );
    }

    const rowChunks = rows.reduce(
      (resultArray: MessageActionRow[][], item, index) => {
        const chunkIndex = Math.floor(index / perChunk);

        if (!resultArray[chunkIndex]) {
          resultArray[chunkIndex] = [];
        }

        resultArray[chunkIndex].push(item);

        return resultArray;
      },
      []
    );

    for (const [i, rows] of rowChunks.entries()) {
      let nav = "Commands";
      const firstCommand = rows[0].components[0].customId.split("#")[0];
      const lastCommand =
        rows[rows.length - 1].components[
          rows[rows.length - 1].components.length - 1
        ].customId.split("#")[0];

      let lastMatchingIndex = -1;
      if (firstCommand !== lastCommand) {
        let matchingCharacters = "";
        for (const [index, char] of firstCommand
          .toUpperCase()
          .split("")
          .entries()) {
          if (lastCommand.length <= index) {
            break;
          }
          if (char === lastCommand.toUpperCase().split("")[index]) {
            lastMatchingIndex = index;
            matchingCharacters += char;
          } else {
            break;
          }
        }
        const firstNav =
          matchingCharacters +
          (firstCommand[lastMatchingIndex + 1]?.toUpperCase() || "");
        const lastNav =
          matchingCharacters +
          (lastCommand[lastMatchingIndex + 1]?.toUpperCase() || "");
        nav += ` (${firstNav} - ${lastNav})`;
      }
      const messageOptions: MessageOptions = {
        content: nav,
        components: rows,
      };
      if (messages.length > i) {
        messages[i].edit(messageOptions);
      } else {
        this.channel.send(messageOptions);
      }
    }

    for (let i = rowChunks.length; i < messages.length; i++) {
      messages[i].delete().catch(() => {});
    }
  }

  async getBotMessages(): Promise<Message[]> {
    await this.deleteOtherMessages();
    const messages = (
      await this.channel.messages.fetch({ limit: 100 }).catch(() => {
        log.error("Could not fetch bot messages");
        return new Collection<string, Message>();
      })
    ).filter(
      (message) =>
        message.author.id === this.channel.guild.me.id &&
        message.content.startsWith("Commands")
    );
    return Array.from(messages.values());
  }

  private async deleteOtherMessages(): Promise<void> {
    let otherUserMessagesFound = true;
    while (otherUserMessagesFound) {
      const messagesToDelete: Message[] = [];
      const messages = await this.channel.messages.fetch({ limit: 100 });
      otherUserMessagesFound = false;
      for (const message of messages.values()) {
        if (
          message.author.id !== this.channel.guild.me.id ||
          !message.content.startsWith("Commands")
        ) {
          otherUserMessagesFound = true;
          messagesToDelete.push(message);
        }
      }
      if (messagesToDelete.length > 0) {
        log.debug(`Deleting ${messagesToDelete.length} messages`);
        const deletedMessages = await this.channel
          .bulkDelete(messagesToDelete, true)
          .catch((e) => {
            otherUserMessagesFound = false;
            console.error(e);
            log.warn(
              "Could not delete other users messages in soundboard channel"
            );
          });
        if (!deletedMessages || deletedMessages.size === 0) {
          otherUserMessagesFound = false;
        }
      }
    }
  }

  async deleteSoundBoardMessages() {
    await this.channel
      .bulkDelete(await this.getBotMessages(), true)
      .catch(() => {
        log.error("Could not delete bot messages");
      });
  }
}
