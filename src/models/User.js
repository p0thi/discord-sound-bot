import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    // _id: mongoose.Schema.Types.ObjectId,
    discordId: { type: String, unique: true },
});

export default {
    model: mongoose.model('User', userSchema),
    schema: userSchema
};