import mongoose from 'mongoose';
import User from './User'

const guildSchema = new mongoose.Schema({
    // _id: mongoose.Schema.Types.ObjectId,
    discordId: { type: String, unique: true },
});

export default {
    model: mongoose.model('Guild', guildSchema),
    schema: guildSchema
}