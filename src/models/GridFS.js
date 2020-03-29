import mongoose from 'mongoose';

const gridFsSchema = new mongoose.Schema({}, { strict: false });

export default {
    model: mongoose.model('GridFS', gridFsSchema, "sounds.files"),
    schema: gridFsSchema
}