import { Document, Types } from "mongoose";
import IAudioFile from "./IAudioFile";
import IGuild from "./IGuild";
import IUser from "./IUser";

export default interface ISound extends Document {
  command: string;
  description: string;
  file: IAudioFile;
  guild: IGuild;
  creator: IUser;
  updatedAt: Date;
  createdAt: Date;
}
