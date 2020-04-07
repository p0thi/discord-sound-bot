import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    // _id: mongoose.Schema.Types.ObjectId,
    discordId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: false, unique: false },
    refreshToken: { type: String, required: false, unique: false },
    expireDate: { type: Date, required: false, unique: false },
});

export default {
    model: mongoose.model('User', userSchema),
    schema: userSchema
};