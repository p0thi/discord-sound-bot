import { Document, ObjectId, Types } from "mongoose";
import { GroupPermission } from "../models/Guild";
import IUser from "./IUser";

export type GroupPermissionKey = keyof typeof GroupPermission;

export interface IPermissionGroup extends Types.Subdocument {
  name: string;
  maxSoundDuration: number;
  maxSoundsPerUser: number;
  discordRoles: string[];
  permissions: [GroupPermissionKey];
  updatedAt: Date;
  createdAt: Date;
}

export default interface IGuild extends Document {
  discordId: string;
  maxSounds: number;
  maxSoundDuration: number;
  bannedUsers: Types.Array<IUser>;
  permissionGroups: Types.DocumentArray<IPermissionGroup>;
  joinSounds: Types.Map<ObjectId>;
  commandPrefix: string;
  soundBoardChannel: string;
}
