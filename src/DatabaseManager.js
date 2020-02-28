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
        mongoose.connect('mongodb://localhost/' + this.path, { useNewUrlParser: true });
        this.db = mongoose.connection;
    }

    async getGuild(cond, content) {
        let guild = await Guild.model.findOne(cond).exec();
        if (!guild) {
            guild = await Guild.model.create(content || cond);
        }
        return guild;
    }

    async getSound(cond) {
        let sound = await Sound.model.findOne(cond).exec();
        return sound;
    }

    async getUser(cond, content) {
        let user = await User.model.findOne(cond).exec();
        if (!user) {
            user = await User.model.create(content || cond);
        }
        return user;
    }
}