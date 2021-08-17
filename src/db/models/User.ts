import { model, Schema } from "mongoose";
import IUser from "../interfaces/IUser";

const userSchema: Schema = new Schema({
  // _id: mongoose.Schema.Types.ObjectId,
  discordId: { type: String, required: true, unique: true },
  favouriteGuilds: {
    type: [{ type: String, required: false, unique: true }],
    default: [],
  },
  favouriteSounds: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "Sound",
        required: false,
        unique: true,
      },
    ],
    default: [],
  },
  accessToken: { type: String, required: false, unique: false },
  refreshToken: { type: String, required: false, unique: false },
  expireDate: { type: Date, required: false, unique: false },
});

const UserModel = model<IUser>("User", userSchema);

export default UserModel;
