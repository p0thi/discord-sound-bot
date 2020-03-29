import mongoose from 'mongoose';
import Guild from './Guild';
import User from './User';

const soundSchema = new mongoose.Schema({
    // _id: mongoose.Schema.Types.ObjectId,
    command: { type: String, unique: false, required: true},
    description: { type: String, unique: false, required: true},
    filename: { type: String, unique: false , required: false},
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'AudioFile', unique: true, required: true},
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', unique: false, required: true},
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: false, required: true},
});

soundSchema.index({ command: 1, guild: 1 }, { unique: true })

export default {
    model: mongoose.model('Sound', soundSchema),
    schema: soundSchema
};