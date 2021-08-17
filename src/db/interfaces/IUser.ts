import { Document, Types } from "mongoose";
import ISound from "./ISound";

export default interface IUser extends Document {
  discordId: string;
  favouriteGuilds: string[];
  favouriteSounds: Types.Array<ISound>;
  accessToken: string;
  refreshToken: string;
  expireDate: Date;
}
