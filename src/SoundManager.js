import { v4 as uuidv4 } from "uuid";
import { parseFile, parseBuffer, parseStream } from "music-metadata";
import stream from "stream";
import DatabaseManager from "./DatabaseManager";

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
  constructor({
    maxSize = 1000000,
    maxLength = 30,
    fileTypes = ["mp3", "flac"],
  } = {}) {
    this.maxSize = maxSize;
    this.maxLength = maxLength;
    this.fileTypes = fileTypes;
  }

  checkFileSize(size) {
    return size <= this.maxSize;
  }

  async checkFileMetadata(buffer) {
    let metadata = await parseBuffer(buffer);
    return this.checkFileDuration(metadata.format.duration);
  }

  checkFileDuration(duration) {
    return duration <= this.maxLength;
  }

  checkFileExtension(fullFileName) {
    let split = fullFileName.split(".");
    let ext = split[split.length - 1];

    if (!this.filename) {
      this.filename = fullFileName;
    }

    return this.fileTypes.includes(ext.trim().toLowerCase());
  }

  createUniqueFilename(fullOldName) {
    let split = fullOldName.split(".");
    let ext = split[split.length - 1];

    this.filename = fullOldName;
    // this.filename = `${split[0]}_${uuidv4()}.${ext}`;
    this.oldFilename = fullOldName;
    return this.filename;
  }

  async storeFile(buffer) {
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

  async createSound(command, description, guild, creator) {
    if (!this.soundFile) {
      throw new Error("Store file first");
    }

    try {
      let sound = await dbManager.Sound.model.create({
        file: this.soundFile,
        command,
        description,
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

  static async isCommandIllegal(command, guild) {
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

    if (
      (await dbManager.Sound.model.countDocuments({ guild, command })) !== 0
    ) {
      return `Command ${command} already exists`;
    }

    for (let item of prohibitedCommands) {
      if (item === command) {
        return `The command "${command}" is reserved for other functions`;
      }
    }

    return false;
  }

  static isDescriptionIllegal(description) {
    if (/^.{3,60}$/.test(description.trim())) {
      return false;
    }
    return "Description is to short or too long.";
  }

  static async deleteSound(sound) {
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
