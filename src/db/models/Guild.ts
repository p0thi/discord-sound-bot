import { model, Schema } from "mongoose";
import IGuild from "../interfaces/IGuild";

export enum GroupPermissions {
  MANAGE_GROUPS = "Allows to manage groups",
  ADD_SOUNDS = "Allows to add sounds to the server",
  PLAY_SOUNDS = "Allows to play sounds",
  USER_JOIN_SOUND = "Allows to use a join sound on the server",
}

console.log(Object.keys(GroupPermissions));

const permissionGroupSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    maxSoundDuration: { type: Number, required: true },
    maxSoundsPerUser: { type: Number, required: true },
    discordRoles: [{ type: String }],
    permissions: [
      {
        type: String,
        enum: Object.keys(GroupPermissions),
      },
    ],
  },
  { timestamps: true }
);

const guildSchema: Schema = new Schema({
  // _id: mongoose.Schema.Types.ObjectId,
  discordId: { type: String, unique: true, required: true },
  maxSounds: { type: Number, default: 30 },
  maxSoundDuration: { type: Number, default: 10 },
  permissionGroups: [permissionGroupSchema],
  joinSounds: {
    type: Map,
    of: {
      type: Schema.Types.ObjectId,
      ref: "Sound",
      required: false,
    },
    default: {},
    unique: false,
  },
  commandPrefix: {
    type: String,
    unique: false,
    required: false,
    maxLength: 1,
    minLength: 1,
    default: "!",
  },
});

const GuildModel = model<IGuild>("Guild", guildSchema);

export default GuildModel;
