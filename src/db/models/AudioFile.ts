import { model, Schema } from "mongoose";
import IAudioFile from "../interfaces/IAudioFile";
import IGuild from "../interfaces/IGuild";

const audioFileFileSchema: Schema = new Schema(
  {
    length: { type: Number },
    aliases: [String],
    chunkSize: { type: Number },
    uploadDate: { type: Date },
    filename: { type: String, trim: true, searchable: true },
    md5: { type: String, trim: true, searchable: true },
  },
  { collection: "audiofiles.files", id: false }
);

const AudioFileFileModel = model<IAudioFile>("AudioFile", audioFileFileSchema);

export default AudioFileFileModel;
