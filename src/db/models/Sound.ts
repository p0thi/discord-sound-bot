import { model, Schema } from "mongoose";
import ISound from "../interfaces/ISound";

const soundSchema: Schema = new Schema(
  {
    // _id: mongoose.Schema.Types.ObjectId,
    command: { type: String, unique: false, required: true },
    description: { type: String, unique: false, required: true },
    // filename: { type: String, unique: false , required: false, sparse: false},
    file: {
      type: Schema.Types.ObjectId,
      ref: "AudioFile",
      unique: true,
      required: true,
    },
    guild: {
      type: Schema.Types.ObjectId,
      ref: "Guild",
      unique: false,
      required: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      unique: false,
      required: true,
    },
  },
  { timestamps: true }
);

soundSchema.index({ command: 1, guild: 1 }, { unique: true });

const SoundModel = model<ISound>("Sound", soundSchema);

export default SoundModel;
