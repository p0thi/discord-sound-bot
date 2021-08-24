import jwt from "jsonwebtoken";
import DatabaseManager from "../../DatabaseManager";
import moment from "moment";
import fetch from "node-fetch";
import log from "../../log";

const dbManager = DatabaseManager.getInstance();

const BASE_URL = process.env.BASE_URL;

export default class AuthManager {
  // boolean
  verifyToken(token) {
    let decode;
    try {
      decode = jwt.verify(token, process.env.JWT_TOKEN);
    } catch (e) {
      return false;
    }
    return decode;
  }

  async getDiscordToken(user) {
    if (!user.accessToken && !user.refreshToken) {
      throw new Error("User has no credentials");
    }

    let expired = moment(user.expireDate)
      .subtract(1, "minutes")
      .isSameOrBefore(moment());

    if (expired) {
      let newResponse = await fetch(
        `https://discord.com/api/oauth2/token`,
        // let newResponse = await fetch(`https://enbzuqytumnlf.x.pipedream.net`,
        {
          method: "POST",
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: user.refreshToken,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uri: `${BASE_URL}/api/auth/callback`,
            scope: "identify guilds",
          }),
        }
      );
      let json = await newResponse.json();

      let newUser = await this.setUserCredentials(user, json);
      return newUser.accessToken;
    } else {
      return user.accessToken;
    }
  }

  async setUserCredentials(user, credentials) {
    user.accessToken = credentials.access_token;
    user.refreshToken = credentials.refresh_token;
    user.expireDate = moment().add(credentials.expires_in, "s");
    let storedUser = await user.save();
    return storedUser;
  }

  // DB User
  async getUserByJWT(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_TOKEN);
    } catch (e) {
      log.error(e);
      return null;
    }
    if (!decoded || !decoded.id) {
      return null;
    }

    let dbUser = await dbManager.getUser({ discordId: decoded.id });
    return dbUser;
  }
}
