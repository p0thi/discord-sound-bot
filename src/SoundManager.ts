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

const dbManager = new DatabaseManager("discord");
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
  maxSize: number;
  maxLength: number;
  fileTypes: string[];

  filename: string;
  oldFilename: string;
  soundFile: MongooseGridFSFileModel;
  constructor({
    maxSize = 1000000,
    maxLength = 30,
    fileTypes = ["mp3", "flac"],
  } = {}) {
    this.maxSize = maxSize;
    this.maxLength = maxLength;
    this.fileTypes = fileTypes;
  }

  checkFileSize(size: number) {
    return size <= this.maxSize;
  }

  async checkFileMetadata(buffer: Buffer) {
    let metadata = await parseBuffer(buffer);
    return this.checkFileDuration(metadata.format.duration);
  }

  checkFileDuration(duration: number) {
    return duration <= this.maxLength;
  }

  checkFileExtension(fullFileName: string) {
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
      console.log(e);
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
      console.log("sound", sound);
      return sound;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  static async isCommandIllegal(command: string, guild: IGuild) {
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

    return false;
  }

  static isDescriptionIllegal(description: string) {
    if (/^.{3,60}$/.test(description.trim())) {
      return false;
    }
    return "Description is to short or too long.";
  }

  static async deleteSound(sound: ISound) {
    console.log("sound", sound.id);
    try {
      await dbManager.unlinkFile(sound.file);
      await sound.delete();
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
}
