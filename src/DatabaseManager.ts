import { connect, FilterQuery, Mongoose, ObjectId } from "mongoose";

import Guild from "./db/models/Guild";
import User from "./db/models/User";
import Sound from "./db/models/Sound";
import log from "./log";
import {
  createModel,
  MongooseGridFS,
  MongooseGridFSFileModel,
} from "mongoose-gridfs";
import IGuild from "./db/interfaces/IGuild";

export default class DatabaseManager {
  path: string;
  conn: Mongoose;
  AudioFile: MongooseGridFS;

  constructor(path) {
    this.path = path;

    this.connect();
  }

  async connect() {
    this.conn = await connect("mongodb://localhost/" + this.path, {
      useNewUrlParser: true,
    });

    this.AudioFile = createModel({
      connection: this.conn.connection,
      modelName: "AudioFile",
    });
  }

  async getFile(_id: string): Promise<MongooseGridFSFileModel> {
    let file = await new Promise<MongooseGridFSFileModel>((resolve, reject) => {
      this.AudioFile.findOne({ _id }, (err, content) => {
        if (err) {
          reject(err);
        }
        resolve(content);
      });
    });
    return file;
  }

  getFileStream(_id) {
    try {
      let stream = this.AudioFile.read({ _id });
      return stream;
    } catch (e) {
      log.error(`Could not find file [${_id}] in db`);
      throw e;
    }
  }

  async storeFile(options, stream): Promise<MongooseGridFSFileModel> {
    let file = await new Promise<MongooseGridFSFileModel>((resolve, reject) => {
      this.AudioFile.write(options, stream, (err, file) => {
        if (err || !file) {
          log.error("Could not write file to DB");
          log.error(err);
          reject();
          return;
        }
        resolve(file);
      });
    });
    return file;
  }

  async unlinkFile(_id): Promise<MongooseGridFSFileModel> {
    let unlinked: MongooseGridFSFileModel;
    try {
      unlinked = await new Promise<MongooseGridFSFileModel>(
        async (resolve, reject) => {
          (await this.getFile(_id)).unlink((err, file) => {
            if (!file && err) {
              reject();
            } else {
              resolve(file);
            }
          });
        }
      );
    } catch (e) {
      throw new Error(e.message + _id);
    }
    return unlinked;
  }

  async getGuild(cond: FilterQuery<IGuild>, content?: any): Promise<IGuild> {
    let guild = await Guild.findOne(cond).exec();
    if (!guild) {
      try {
        guild = await Guild.create(content || cond);
      } catch (e) {
        console.error(e);
      }
    }
    return guild;
  }

  async getSound(cond) {
    let sound = await Sound.findOne(cond).exec();
    return sound;
  }

  async getSounds(cond) {
    let sounds = await Sound.find(cond).exec();
    return sounds;
  }

  async getSoundById(id: string | ObjectId) {
    let sound = await Sound.findById(id).exec();
    return sound;
  }

  async getRandomSoundForGuild(guildId) {
    return await Sound.aggregate([
      { $match: { guild: guildId } },
      { $sample: { size: 1 } },
    ]);
  }

  async getAllGuildSounds(guild) {
    let sounds = await Sound.find({ guild });
    return sounds;
  }

  async getUser(cond, content?) {
    let user = await User.findOne(cond).exec();
    if (!user) {
      user = await User.create(content || cond);
    }
    return user;
  }
}
