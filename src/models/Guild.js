import mongoose from 'mongoose';
import User from './User'
import Sound from './Sound'

const guildSchema = new mongoose.Schema({
    // _id: mongoose.Schema.Types.ObjectId,
    discordId: { type: String, unique: true, required: true },
    joinSounds: {
        type: Map,
        of: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Sound',
            required: false
        },
        default: {},
        unique: false
    },
    commandPrefix: { type: String, unique: false, required: false, default: "!" }
});

export default {
    model: mongoose.model('Guild', guildSchema),
    schema: guildSchema
}