import { connect, FilterQuery, Mongoose, ObjectId } from "mongoose";

import {
  createModel,
  MongooseGridFS,
  MongooseGridFSFileModel,
} from "mongoose-gridfs";
import IAudioFile from "../db/interfaces/IAudioFile";
import IGuild from "../db/interfaces/IGuild";
import ISound from "../db/interfaces/ISound";
import IUser from "../db/interfaces/IUser";
import AudioFileFileModel from "../db/models/AudioFile";
import Guild from "../db/models/Guild";
import Sound from "../db/models/Sound";
import User from "../db/models/User";
import log from "../log";

export default class DatabaseManager {
  private static _instances: DatabaseManager;
  path: string;
  conn: Mongoose;
  AudioFile: MongooseGridFS;

  private constructor(path) {
    this.path = path;

    this.connect();
  }

  static getInstance() {
    if (!DatabaseManager._instances) {
      DatabaseManager._instances = new DatabaseManager("discord");
    }
    return DatabaseManager._instances;
  }

  async connect() {
    this.conn = await connect(process.env.BASE_MONGO_PATH + this.path, {
      // useNewUrlParser: true,
    });

    this.AudioFile = createModel({
      connection: this.conn.connection,
      modelName: "AudioFile",
    });
  }

  async getFile(audioFile: IAudioFile): Promise<MongooseGridFSFileModel> {
    let file = await new Promise<MongooseGridFSFileModel>((resolve, reject) => {
      this.AudioFile.findById(audioFile, (err, content) => {
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
    return new Promise<IGuild>(async (resolve, reject) => {
      let guild = await Guild.findOne(cond).exec().catch();
      if (!guild) {
        guild =
          (await Guild.create(content || cond).catch(async (e) => {
            setTimeout(async () => {
              guild =
                (await Guild.findOne(cond).exec().catch(reject)) || undefined;

              if (!guild) {
                return reject();
              } else {
                return resolve(guild);
              }
            }, 200 + Math.ceil(Math.random() * 800));
          })) || undefined;
        if (guild) {
          return resolve(guild);
        } else {
          return reject();
        }
      } else {
        return resolve(guild);
      }
    });
  }

  async getSound(cond) {
    let sound = await Sound.findOne(cond).exec();
    return sound;
  }

  async getSounds(cond): Promise<ISound[]> {
    let sounds = await Sound.find(cond).exec();
    return sounds;
  }

  async getSoundById(id: string | ObjectId): Promise<ISound> {
    let sound = await Sound.findById(id).exec();
    return sound;
  }

  async getRandomSoundForGuild(guild: IGuild): Promise<ISound> {
    const results = await Sound.aggregate<ISound>([
      { $match: { guild: guild._id } },
      { $sample: { size: 1 } },
    ]);
    return await this.getSoundById(results[0]._id);
  }

  async getAllGuildSounds(guild: IGuild) {
    let sounds = await Sound.find({ guild });
    return sounds;
  }

  async getUser(cond) {
    return new Promise<IUser>(async (resolve, reject) => {
      let user = await User.findOne(cond).exec();
      if (!user) {
        user =
          (await User.create(cond).catch(async () => {
            setTimeout(async () => {
              user =
                (await User.findOne(cond).exec().catch(reject)) || undefined;

              if (!user) {
                return reject();
              } else {
                return resolve(user);
              }
            }, 200 + Math.ceil(Math.random() * 800));
          })) || undefined;

        if (user) {
          return resolve(user);
        } else {
          return reject();
        }
      } else {
        return resolve(user);
      }
    });
  }
}
