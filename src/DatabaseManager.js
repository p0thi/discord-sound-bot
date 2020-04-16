import mongoose from 'mongoose';
// import Grid from 'gridfs-stream'
// Grid.mongo = mongoose.mongo;

import { createModel } from 'mongoose-gridfs';
import util from 'util';

import Guild from './models/Guild'
import User from './models/User'
import Sound from './models/Sound'
import log from '../log'
import { startTimer } from 'winston';

export default class DatabaseManager {
    constructor(path) {
        this.path = path;
        this.conn;
        this.gfs;
        this.mongoose = mongoose;

        this.connect();
    }

    async connect() {
        this.conn = await mongoose.connect('mongodb://localhost/' + this.path, { useNewUrlParser: true });

        // this.gfs = Grid(this.conn.db)
        // this.gfs.collection('sounds')

        this.Sound = Sound;
        this.User = User;
        this.Guild = Guild;

        this.AudioFile = createModel({
            connection: this.conn.db,
            modelName: 'AudioFile',
            collection: 'audiofiles'
        })
    }

    async getFile(_id) {
        let file = await new Promise((resolve, reject) => {
            this.AudioFile.findOne({_id}, (err, content) => {
                if (err) {
                    reject(err);
                }
                resolve(content);
            })
        });
        return file;
    }

    getFileStream(_id) {
        try {
            let stream = this.AudioFile.read({ _id });
            return stream;
        }
        catch (e) {
            log.error(`Could not find file [${_id}] in db`);
            throw e;
        }
    }

    async storeFile(options, stream) {

        let file = await new Promise((resolve, reject) => {
            this.AudioFile.write(options, stream, (err, file) => {
                if (err || !file) {
                    log.error("Could not write file to DB");
                    log.error(err);
                    reject();
                    return;
                }
                resolve(file);
            })
        })
        return file;
    }

    async unlinkFile(_id) {
        let unlinked;
        try {
            unlinked = await new Promise((resolve, reject) => {
                this.AudioFile.unlink(_id, (err, file) => {
                    if (!file && err) {
                        reject()
                    }
                    else {
                        resolve(file);
                    }
                })
            })
        }
        catch (e) {
            throw new Error(e.message + _id);
        }
        return unlinked;
    }

    async getGuild(cond, content) {
        let guild = await Guild.model.findOne(cond).exec();
        if (!guild) {
            try {
                guild = await Guild.model.create(content || cond);
            } catch (e) {
                console.error(e);
            }
        }
        return guild;
    }

    async getSound(cond) {
        let sound = await Sound.model.findOne(cond).exec();
        return sound;
    }

    async getSounds(cond) {
        let sounds = await Sound.model.find(cond).exec();
        return sounds;
    }

    async getSoundById(id) {
        let sound = await Sound.model.findById(id).exec();
        return sound;
    }

    async getAllGuildSounds(guild) {
        let sounds = await Sound.model.find({ guild });
        return sounds;
    }

    async getUser(cond, content) {
        let user = await User.model.findOne(cond).exec();
        if (!user) {
            user = await User.model.create(content || cond);
        }
        return user;
    }
}