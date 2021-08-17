import { Document, ObjectId, Types } from "mongoose";
import { GroupPermissions } from "../models/Guild";

export interface IPermissionGroup extends Types.Subdocument {
  name: string;
  description: string;
  maxSoundDuration: number;
  maxSoundsPerUser: number;
  discordRoles: string[];
  permissions: [keyof typeof GroupPermissions];
  updatedAt: Date;
  createdAt: Date;
}

export default interface IGuild extends Document {
  discordId: string;
  maxSounds: number;
  maxSoundDuration: number;
  permissionGroups: Types.DocumentArray<IPermissionGroup>;
  joinSounds: Types.Map<ObjectId>;
  commandPrefix: string;
}
