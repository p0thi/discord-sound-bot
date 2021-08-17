import { Router } from "express";
import fetch from "node-fetch";
import DatabaseManager from "../DatabaseManager";
import AuthManager from "./managers/AuthManager";
import log from "../log";

const authManager = new AuthManager();
const dbManager = new DatabaseManager("discord");

const router = Router();

router.get("/self", async (req, res) => {
  const botUser = await req.bot.users.fetch(req.userId);
  const dbUser = await dbManager.getUser({ discordId: req.userId });
  res.status(200).send({
    id: botUser.id,
    username: botUser.username,
    discriminator: botUser.discriminator,
    favouriteGuilds: dbUser.favouriteGuilds || [],
    favouriteSounds: dbUser.favouriteSounds || [],
    displayAvatarURL: botUser.displayAvatarURL({
      format: "png",
      dynamic: true,
    }),
  });
});

module.exports = router;
