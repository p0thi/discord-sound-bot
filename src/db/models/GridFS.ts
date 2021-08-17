import { model, Schema } from "mongoose";
const gridFsSchema: Schema = new Schema({}, { strict: false });

const GridFSModel = model("GridFS", gridFsSchema, "sounds.files");

export default GridFSModel;
