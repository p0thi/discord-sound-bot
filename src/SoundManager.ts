import { v4 as uuidv4 } from "uuid";
import { parseFile, parseBuffer, parseStream } from "music-metadata";
import stream from "stream";
import DatabaseManager from "./DatabaseManager";
import {
  MongoGridFSOptions,
  MongooseGridFS,
  MongooseGridFSFileModel,
} from "mongoose-gridfs";
import SoundModel from "./db/models/Sound";
import IUser from "./db/interfaces/IUser";
import IGuild from "./db/interfaces/IGuild";
import ISound from "./db/interfaces/ISound";
import DatabaseGuildManager from "./DatabaseGuildManager";
import {
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessagePayload,
  MessageTarget,
  PartialTextBasedChannel,
  SelectMenuInteraction,
  TextBasedChannel,
  TextBasedChannels,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import log from "./log";
import { hyperlink } from "@discordjs/builders";
import AudioManager from "./AudioManager";
import MultiPageMessage, {
  MultiPageMessageOfFieldsOptions,
} from "./MultiPageMessage";
import MessageDeleter from "./MessageDeleter";

const dbManager = DatabaseManager.getInstance();
const prohibitedCommands = [
  "help",
  "hilfe",
  "debug",
  "commands",
  "download",
  "dl",
  "gif",
  "joke",
  "play",
  "random",
];

export default class SoundManager {
  dbGuild: IGuild;
  maxSize: number;
  fileTypes: string[];

  filename: string;
  oldFilename: string;
  soundFile: MongooseGridFSFileModel;
  constructor(
    dbGuild: IGuild,
    { maxSize = 1000000, fileTypes = ["mp3", "flac"] } = {}
  ) {
    this.maxSize = maxSize;
    this.fileTypes = fileTypes;
    this.dbGuild = dbGuild;
  }

  async checkFilePermissions(
    member: GuildMember,
    data: FileData
  ): Promise<string | void> {
    const dbGuildManager = new DatabaseGuildManager(this.dbGuild);
    if (!(await dbGuildManager.canAddSounds(member))) {
      return "You can not upload sounds";
    }
    if (await dbGuildManager.maxGuildSoundsReached()) {
      return `Max amount of sounds for this server reached (${this.dbGuild.maxSounds})`;
    }
    if (await dbGuildManager.maxMemberSoundsReached(member)) {
      return `Max amount of sounds for this user reached (${dbGuildManager.getMaxSoundsPerUser(
        member
      )})`;
    }
    if (!this.checkFileExtension(data.name)) {
      return `File type is not supported (only ${this.fileTypes.join(", ")})`;
    }
    if (!this.checkFileSize(data.size)) {
      return "File is too big";
    }
    const maxDurationForMember =
      dbGuildManager.getMaxSoundDurationForMember(member);
    if (data.duration > maxDurationForMember) {
      return `File is too long (max ${maxDurationForMember} sec)`;
    }
    return;
  }

  private checkFileSize(size: number) {
    return size <= this.maxSize;
  }

  async getFileDuration(buffer: Buffer): Promise<number | void> {
    const audioMetaData = await parseBuffer(buffer).catch((e) => {
      log.error("could not parse audio");
    });
    return !!audioMetaData ? audioMetaData.format.duration : undefined;
  }

  private checkFileExtension(fullFileName: string) {
    let split = fullFileName.split(".");
    let ext = split[split.length - 1];

    if (!this.filename) {
      this.filename = fullFileName;
    }

    return this.fileTypes.includes(ext.trim().toLowerCase());
  }

  createUniqueFilename(fullOldName: string) {
    let split = fullOldName.split(".");
    let ext = split[split.length - 1];

    this.filename = fullOldName;
    // this.filename = `${split[0]}_${uuidv4()}.${ext}`;
    this.oldFilename = fullOldName;
    return this.filename;
  }

  async storeFile(buffer: Buffer) {
    if (!this.filename) {
      throw new Error("Set file name first");
    }
    let downloadFileStream = new stream.PassThrough();
    downloadFileStream.end(buffer);
    try {
      let soundFile = await dbManager.storeFile(
        { filename: this.filename },
        downloadFileStream
      );
      this.soundFile = soundFile;
      return soundFile;
    } catch (e) {
      log.error(e);
      throw e;
    }
  }

  async createSound(
    command: string,
    description: string,
    guild: IGuild,
    creator: IUser
  ) {
    if (!this.soundFile) {
      throw new Error("Store file first");
    }

    try {
      const sound = await SoundModel.create({
        command,
        description,
        file: this.soundFile,
        guild,
        creator,
      });
      return sound;
    } catch (e) {
      log.error(e);
      throw e;
    }
  }

  static async isCommandIllegal(
    command: string,
    guild: IGuild
  ): Promise<string | void> {
    command = command.trim();
    if (!command || !guild) {
      throw new Error("Not all arguments provided");
    }

    if (
      /^.{0,2}$|^.{16,}$|^.*?(?=[\t\0\n\s\^#%&`="$\!§$?^*:<>\\\?\/\{\|\}]).*$/.test(
        command
      )
    ) {
      return "Command is too short, too long or contains invalid characters.";
    }

    if ((await SoundModel.countDocuments({ guild, command }).exec()) !== 0) {
      return `Command ${command} already exists`;
    }

    for (let item of prohibitedCommands) {
      if (item === command) {
        return `The command "${command}" is reserved for other functions`;
      }
    }

    return;
  }

  static isDescriptionIllegal(description: string): string | void {
    if (/^.{3,60}$/.test(description.trim())) {
      return;
    }
    return "Description is to short or too long.";
  }

  static async deleteSound(sound: ISound) {
    try {
      await dbManager.unlinkFile(sound.file);
      await sound.delete();
    } catch (e) {
      log.error(e);
      throw e;
    }
  }
  static async sendCommandsList(
    target: TextBasedChannels | CommandInteraction,
    channel: TextBasedChannels,
    dbGuild: IGuild,
    search?: string
  ) {
    const deleter = MessageDeleter.getInstance();
    const sounds = (await dbManager.getAllGuildSounds(dbGuild)).sort((a, b) =>
      a.command.localeCompare(b.command)
    );
    const filteredSounds = sounds.filter(
      (s) =>
        !search ||
        s.command.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
    );
    const botUrl = `https://sounds.pothi.eu/#/guilds?guild=${dbGuild.discordId}`;
    const messageOptions = MultiPageMessage.createMultipageMessageOfFields(
      new MultiPageMessageOfFieldsOptions({
        channel,
        title: "All commands",
        url: botUrl,
        description: `Here is a list of all sound commmands of this server. You can also find them ${hyperlink(
          "here",
          botUrl
        )}\nYou can select one at the time in the drop down menu below to play it.`,
        fields: filteredSounds.map((sound) => ({
          name: dbGuild.commandPrefix + sound.command,
          value: sound.description,
          inline: true,
        })),
        withSelectMenu: true,
        fieldToUseForSelectValue: "name",
        selectPlaceholder: "Select a command from above to play",
      })
    );

    MessagePayload.create(target, messageOptions);

    let message;
    if (target instanceof Interaction) {
      message = await target.followUp(messageOptions);
    } else {
      message = await target.send(messageOptions);
    }

    deleter.add(message, 550000);
    const collector = message.createMessageComponentCollector({
      componentType: "SELECT_MENU",
      time: 600000,
    });
    collector.on("collect", async (component: SelectMenuInteraction) => {
      component.deferUpdate();
      const member = component.member as GuildMember;
      const command = component.values[0].match(dbGuild.commandPrefix)
        ? component.values[0].replace(dbGuild.commandPrefix, "")
        : component.values[0];
      const sound = await dbManager.getSound({
        guild: dbGuild,
        command,
      });
      if (!sound) {
        component.followUp({
          content: "That sound doesn't exist",
          ephemeral: true,
        });
        return;
      }
      new AudioManager().memberPlaySound(
        member,
        sound,
        member.voice.channel as VoiceChannel
      );
    });
  }
}

export interface FileData {
  name: string;
  size: number;
  duration: number;
}
