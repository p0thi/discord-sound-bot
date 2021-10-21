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

  static checkChananelAge(channel: TextChannel): boolean {
    const youngerThan2Weeks =
      new Date().getTime() - channel.createdAt.getTime() < 1209600000;
    if (!youngerThan2Weeks) {
      log.error("Soundboard channel was not created in the last 2 weeks");
    }
    return youngerThan2Weeks;
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
            const spacer = "    "; /* .repeat(
              Math.floor(Math.max(16 - c.command.length, 0) * 1.5)
            ); */
            const label = spacer + c.command + spacer;
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
      const previousLastCommand =
        i > 0
          ? rowChunks[i - 1][rowChunks[i - 1].length - 1].components[
              rowChunks[i - 1][rowChunks[i - 1].length - 1].components.length -
                1
            ].customId.split("#")[0]
          : null;
      const nextFirstCommand =
        i < rowChunks.length - 1
          ? rowChunks[i + 1][0].components[0].customId.split("#")[0]
          : null;

      const firstMutual = this.getMutualCoherentString(
        previousLastCommand?.toUpperCase(),
        firstCommand.toUpperCase()
      );
      const lastMutual = this.getMutualCoherentString(
        lastCommand.toUpperCase(),
        nextFirstCommand?.toUpperCase()
      );
      const firstNav =
        !!previousLastCommand && firstCommand !== lastCommand
          ? firstMutual + firstCommand.charAt(firstMutual.length).toUpperCase()
          : firstCommand.toUpperCase();
      const lastNav = !!nextFirstCommand
        ? lastMutual + lastCommand.charAt(lastMutual.length).toUpperCase()
        : lastCommand.toUpperCase();
      nav +=
        firstNav === lastNav ? ` (${firstNav})` : ` (${firstNav} - ${lastNav})`;
      const messageOptions: MessageOptions = {
        content: nav,
        components: rows,
      };
      if (messages.length > i) {
        outer_loop: for (const [
          x,
          row,
        ] of messageOptions.components.entries()) {
          for (const [y, component] of row.components.entries()) {
            if (
              (component as MessageButton).customId !==
                (messages[i].components[x].components[y] as MessageButton)
                  .customId ||
              (component as MessageButton).label !==
                (messages[i].components[x].components[y] as MessageButton)
                  .label ||
              messageOptions.content !== messages[i].content
            ) {
              messages[i].edit(messageOptions);
              break outer_loop;
            }
          }
        }
      } else {
        this.channel.send(messageOptions);
      }
    }

    const randomMessageOptions = {
      content: "Random",
      components: [
        new MessageActionRow().addComponents([
          new MessageButton()
            .setCustomId("random#soundboardButton")
            .setLabel("Random 🔀")
            .setStyle("PRIMARY"),
        ]),
      ],
    } as MessageOptions;

    if (messages.length > rowChunks.length) {
      if (messages[rowChunks.length].content !== randomMessageOptions.content) {
        messages[rowChunks.length].edit(randomMessageOptions);
      }
    } else {
      this.channel.send(randomMessageOptions);
    }

    for (let i = rowChunks.length + 1; i < messages.length; i++) {
      messages[i].delete().catch(() => {});
    }
  }

  getMutualCoherentString(a: string, b: string): string {
    if (!a || a.length === 0 || !b || b.length === 0) {
      return "";
    }
    const aChars = a.split("");
    const bChars = b.split("");
    let result = "";
    for (const [x, aChar] of aChars.entries()) {
      if (bChars[x] === aChar) {
        result += aChar;
      } else {
        break;
      }
    }
    return result;
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
        this.isMessageCommandMessage(message)
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
          !this.isMessageCommandMessage(message)
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

  private isMessageCommandMessage(message: Message): boolean {
    return (
      message.content.startsWith("Commands") ||
      message.content.startsWith("Random")
    );
  }

  async deleteSoundBoardMessages() {
    await this.channel
      .bulkDelete(await this.getBotMessages(), true)
      .catch(() => {
        log.error("Could not delete bot messages");
      });
  }
}
