import { model, Schema } from "mongoose";
import IGuild from "../interfaces/IGuild";

export enum GroupPermission {
  MANAGE_GROUPS = "Allows to manage permission groups",
  MANAGE_GUILD_SETTINGS = "Allows to manage guild (server) settings",
  BAN_USERS = "Allows to ban users",
  DELETE_ALL_SOUNDS = "Allows to delete all sounds (not just the own) from the server",
  ADD_SOUNDS = "Allows to add sounds to the server",
  PLAY_SOUNDS = "Allows to play sounds",
  USE_JOIN_SOUND = "Allows to use a join sound on the server",
}

export const defaultMaxSounds = 30;
export const defaultMaxDuration = 10;
export const defaultGroupName = "Default";

export const groupPermissions = new Map(
  Object.entries(GroupPermission).map((entry) => entry.reverse()) as [
    GroupPermission,
    keyof typeof GroupPermission
  ][]
);

export const reverseGroupPermissions = new Map(
  Object.entries(GroupPermission) as [
    keyof typeof GroupPermission,
    GroupPermission
  ][]
);

const permissionGroupSchema = new Schema(
  {
    name: { type: String, required: true },
    maxSoundDuration: { type: Number, required: true, default: 0 },
    maxSoundsPerUser: { type: Number, required: true, default: 0 },
    discordRoles: [{ type: String }],
    permissions: [
      {
        type: String,
        enum: Object.keys(GroupPermission),
      },
    ],
  },
  { timestamps: true }
);

const guildSchema: Schema = new Schema(
  {
    // _id: mongoose.Schema.Types.ObjectId,
    discordId: { type: String, unique: true, required: true },
    maxSounds: { type: Number, default: defaultMaxSounds },
    maxSoundDuration: { type: Number, default: defaultMaxDuration },
    permissionGroups: {
      type: [permissionGroupSchema],
      default() {
        const _t = this as IGuild;
        return [
          {
            name: defaultGroupName,
            maxSoundDuration: defaultMaxDuration,
            maxSoundsPerUser: defaultMaxSounds,
            discordRoles: [_t.discordId],
            permissions: ["ADD_SOUNDS", "PLAY_SOUNDS", "USE_JOIN_SOUND"],
          },
        ];
      },
    },
    bannedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
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
    soundBoardChannel: { type: String, required: false },
  },
  { timestamps: true }
);

const GuildModel = model<IGuild>("Guild", guildSchema);

export default GuildModel;
