import { Router } from "express";
import rateLimit from "express-rate-limit";
import AuthManager from "./managers/AuthManager";
import fileUpload, { UploadedFile } from "express-fileupload";
import log from "../log";
import { _sendError } from "./utils";
import SoundModel from "../db/models/Sound";
import { StageChannel } from "discord.js";
import AudioManager from "../managers/AudioManager";
import DatabaseGuildManager from "../managers/DatabaseGuildManager";
import DatabaseManager from "../managers/DatabaseManager";
import SoundManager from "../managers/SoundManager";
import IGuild from "../db/interfaces/IGuild";
import ISound from "../db/interfaces/ISound";

const authManager = new AuthManager();
const dbManager = DatabaseManager.getInstance();
const audioManager = new AudioManager();

const router = Router();

const playRateLimit = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW,
  max: 2,
  skipFailedRequests: true,
  message: {
    status: "error",
    message: `2 Commands every ${Math.ceil(
      parseInt(process.env.RATE_LIMIT_WINDOW) / 1000
    )} seconds`,
  },
  keyGenerator(req) {
    return req.userId;
  },
});

// const _sendError = (res, msg, code = 400) => {
//     log.error(msg);
//     res.status(code).send({
//         status: 'error',
//         message: msg
//     });
// }

router.get("/play", playRateLimit, async (req, res) => {
  if (!req.query.id) {
    _sendError(res, "Id not provided");
    return;
  }

  let sound: ISound;
  let dbGuild: IGuild;
  if (req.query.id === "random" && req.query.guild) {
    dbGuild = await dbManager.getGuild({
      discordId: req.query.guild as string,
    });
    sound = await dbManager.getRandomSoundForGuild(dbGuild);
  } else {
    sound = await dbManager.getSoundById(req.query.id as string);
    try {
      dbGuild = await dbManager.getGuild({ _id: sound.guild });
    } catch (err) {
      _sendError(res, "Server not found in database");
      return;
    }
  }

  if (!sound) {
    _sendError(res, "Sound not found");
    return;
  }

  const user = await req.bot.users.fetch(req.userId);
  if (!user) {
    _sendError(res, "User not found");
    return;
  }

  const discordGuild = await req.bot.guilds.fetch(dbGuild.discordId);
  if (!discordGuild) {
    _sendError(res, "Discord Server not found");
    return;
  }

  const guildMember = discordGuild.members.cache.get(user.id);
  if (!guildMember) {
    _sendError(res, "User not found on this server");
    return;
  }

  const voiceState = guildMember.voice;
  if (!voiceState) {
    _sendError(res, "Voice status of the user cannot be determined");
    return;
  }

  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  if (
    !dbGuildManager.isBotOwner(req.userId) &&
    !(await dbGuildManager.canPlaySounds(guildMember))
  ) {
    _sendError(res, "User is not allowed to play sounds");
    return;
  }

  const channel = voiceState.channel;
  if (!channel || channel instanceof StageChannel) {
    _sendError(res, "You have to be in a channel", 409);
    return;
  }

  const shouldBlock = req.query.block || true;

  audioManager.memberPlaySound(guildMember, sound, channel).then(() => {
    res.status(200).send();
  });
  if (!shouldBlock || shouldBlock === "false") {
    res.status(200).send();
  }
});

router.get("/listen/:id", async (req, res) => {
  const sound = await SoundModel.findOne({ _id: req.params.id })
    .populate("guild")
    .exec();
  if (!sound) {
    _sendError(res, "Sound not available");
    return;
  }

  const botGuild = await req.bot.guilds.fetch(sound.guild.discordId);
  if (!botGuild) {
    _sendError(res, "Discord Server not available");
    return;
  }

  const botUser = await req.bot.users.fetch(req.userId);
  if (!botUser) {
    _sendError(res, "User not found");
    return;
  }

  if (req.userId !== process.env.BOT_OWNER) {
    if (!botGuild.members.cache.get(req.userId)) {
      _sendError(res, "Not allowed to play the sound");
      return;
    }
  }

  const file = await dbManager.getFile(sound.file);
  if (!file) {
    _sendError(res, "File not found", 500);
    return;
  }

  const ext = file.filename.split(".").pop();
  const fileStream = dbManager.getFileStream(sound.file);
  res.setHeader("Content-Type", `audio/${ext}`);
  fileStream.pipe(res);
  // res.status(200).send()
});

router.post("/upload", fileUpload(), async (req, res) => {
  const [dbGuild, member] = await Promise.all([
    dbManager.getGuild({ discordId: req.body.guild }),
    req.bot.guilds.cache.get(req.body.guild).members.fetch(req.userId),
  ]);
  const command = req.body.command;

  const commandIllegal = await SoundManager.isCommandIllegal(command, dbGuild);
  if (!!commandIllegal) {
    _sendError(res, commandIllegal);
    return;
  }

  const description = req.body.description;

  const descriptionIllegal = SoundManager.isDescriptionIllegal(description);
  if (descriptionIllegal) {
    _sendError(res, descriptionIllegal);
    return;
  }

  const soundManager = new SoundManager(dbGuild);
  const file = req.files.file;

  if (!file) {
    _sendError(res, "No file provided");
    return;
  }

  const duration = await soundManager.getFileDuration(
    (file as UploadedFile).data
  );

  if (!duration) {
    log.info(`Could not get medatada from file`);
    _sendError(res, "Could not get metadata from file");
    return;
  }

  const errorReason = await soundManager.checkFilePermissions(member, {
    size: (file as UploadedFile).size,
    duration,
    name: (file as UploadedFile).name,
  });

  if (errorReason) {
    _sendError(res, errorReason);
    return;
  }

  try {
    await soundManager.storeFile((file as UploadedFile).data);
  } catch (e) {
    _sendError(res, e.message, 500);
    return;
  }

  const creator = await dbManager.getUser({ discordId: req.userId });

  let sound;
  try {
    sound = await soundManager.createSound(
      command,
      description,
      dbGuild,
      creator
    );
  } catch (e) {
    _sendError(res, e.message, 500);
    soundManager.soundFile.unlink((err) => {
      if (err) log.error(err);
    });
  }
  res.status(200).send(sound);
});

router.delete("/delete", async (req, res) => {
  const sound = await SoundModel.findOne({ _id: req.body.sound })
    .populate("creator")
    .populate("guild")
    .exec();
  const dbGuild = sound.guild;
  const botGuild = await req.bot.guilds.fetch(dbGuild.discordId);
  const member = await botGuild.members.fetch(req.userId).catch(() => {
    log.warn(`Could not get Member for ${req.userId}`);
  });

  // console.log('botGuild', botGuild.id)
  // console.log('dbGuild', dbGuild.discordId)
  // res.status(200).send()
  // return

  if (!sound) {
    _sendError(res, "Sound not found", 404);
    return;
  }

  if (!botGuild) {
    _sendError(res, "Discord guild not found", 404);
    return;
  }

  if (!dbGuild) {
    _sendError(res, "Database guild not found", 404);
    return;
  }

  const dbGuildManager = new DatabaseGuildManager(dbGuild);

  if (
    sound.creator.discordId !== req.userId &&
    req.userId !== botGuild.ownerId &&
    !dbGuildManager.isBotOwner(req.userId) &&
    (!member || !(await dbGuildManager.canDeleteSound(member, sound)))
  ) {
    _sendError(res, "Insufficient permissions", 403);
    return;
  }

  try {
    await SoundManager.deleteSound(sound);
    res.status(200).send({
      status: "success",
      message: "Sound deleted",
    });
  } catch (e) {
    res.status(500).send({
      status: "error",
      message: "Could not delete sound",
    });
  }
});

router.post("/joinsound", async (req, res) => {
  let dbGuild: IGuild;

  if (!req.body.sound) {
    if (!req.body.guild) {
      _sendError(res, "Join sound could not be set or disabled.");
      return;
    }

    dbGuild = await dbManager.getGuild({ discordId: req.body.guild });
    const member = await req.bot.guilds.cache
      .get(req.body.guild)
      .members.fetch(req.userId)
      .catch(() => {
        log.warn(`Could not get Member for ${req.userId}`);
      });

    const dbGuildManager = new DatabaseGuildManager(dbGuild);

    if (
      !dbGuildManager.isBotOwner(req.userId) &&
      (!member || !(await dbGuildManager.canUseJoinSound(member)))
    ) {
      _sendError(res, "Insufficient permissions");
      return;
    }

    dbGuild.joinSounds.delete(req.userId);
  } else {
    const sound = await SoundModel.findOne({ _id: req.body.sound })
      .populate("guild")
      .exec();
    dbGuild = sound.guild;
    const member = await req.bot.guilds.cache
      .get(dbGuild.discordId)
      .members.fetch(req.userId)
      .catch(() => {
        log.warn(`Could not get Member for ${req.userId}`);
      });
    const dbGuildManager = new DatabaseGuildManager(dbGuild);

    if (
      !dbGuildManager.isBotOwner(req.userId) &&
      (!member || !(await dbGuildManager.canUseJoinSound(member)))
    ) {
      _sendError(res, "Insufficient permissions");
      return;
    }
    dbGuild.joinSounds.set(req.userId, sound._id);
  }

  try {
    await dbGuild.save();
    res.status(200).send({
      status: "success",
      message: "Join sound changed successfully.",
    });
  } catch (e) {
    _sendError(res, "Join sound could not be set or deleted.", 500);
    return;
  }
});

router.get("/guildsounds/:id", async (req, res) => {
  const botGuild = await req.bot.guilds.fetch(req.params.id);
  if (!botGuild) {
    _sendError(res, "Server not found");
    return;
  }
  let user;

  try {
    user = await botGuild.members.fetch(req.userId);
  } catch (err) {
    log.error("Member not found");
  }
  if (!user && req.userId !== process.env.BOT_OWNER) {
    _sendError(
      res,
      `User not on this server. User: ${req.userId}; Server: ${req.params.id}`
    );
    return;
  }

  const dbGuild = await dbManager.getGuild({ discordId: req.params.id });
  if (!dbGuild) {
    _sendError(res, "Server not in the database");
    return;
  }

  let sounds = await SoundModel.find({ guild: dbGuild })
    .populate("creator")
    .exec();
  const result = sounds
    .filter((s) => !!s.creator)
    .map((sound) => {
      return {
        id: sound.id,
        guild: req.params.id,
        command: sound.command,
        description: sound.description,
        createdAt: sound.createdAt,
        creator: sound.creator.discordId === req.userId,
      };
    });

  res.status(200).send(result);
});

router.post("/favourite/:action", async (req, res) => {
  if (!req.body.sound) {
    _sendError(res, "Sound not provided");
    return;
  }
  const sound = await SoundModel.findOne({ _id: req.body.sound })
    .populate("guild")
    .exec();
  if (!sound) {
    _sendError(res, "Invalid sound provided");
    return;
  }

  const botMember = (
    await req.bot.guilds.fetch(sound.guild.discordId)
  ).members.cache.get(req.userId);
  if (!botMember && req.userId !== process.env.BOT_OWNER) {
    _sendError(res, "User has insufficient permissions");
    return;
  }

  const dbUser = await dbManager.getUser({ discordId: req.userId });

  switch (req.params.action) {
    case "add": {
      if (!dbUser.favouriteSounds.includes(req.body.sound)) {
        dbUser.favouriteSounds.push(req.body.sound);
        await dbUser.save();
      }
      res.status(200).send({
        status: "success",
        message: "Sound added to favorites",
        data: req.body.sound,
      });
      break;
    }
    case "remove": {
      if (dbUser.favouriteSounds.includes(req.body.sound)) {
        dbUser.favouriteSounds.splice(
          dbUser.favouriteSounds.indexOf(req.body.sound),
          1
        );
        await dbUser.save();
      }
      res.status(200).send({
        status: "success",
        message: "Sound removed from favorites",
        data: req.body.sound,
      });
      break;
    }
    default:
      _sendError(res, "Invalid action");
      return;
  }
});

module.exports = router;
