import mongoose from 'mongoose';
import Guild from './models/Guild'
import User from './models/User'
import Sound from './models/Sound'

export default class DatabaseManager {
    constructor(path) {
        this.path = path;
        this.db = undefined;
    }

    connect() {
        if(process.env.NODE_ENV === 'production') {
            mongoose.connect('mongodb://localhost/' + this.path, { useNewUrlParser: true, auth: { user: "readWrite", password: "92783188152", authSource: "admin" } });
        } else {
            mongoose.connect('mongodb://localhost/' + this.path, { useNewUrlParser: true });
        }
        this.db = mongoose.connection;
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
        let sounds = await Sound.model.find({guild});
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