import express from "express";
import fetch from "node-fetch";
import AuthManager from "./managers/AuthManager";
import { _sendError } from "./utils";
import log from "../log";
import IGuild, {
  GroupPermissionKey,
  IPermissionGroup,
} from "../db/interfaces/IGuild";
import { Types } from "mongoose";
import GuildModel, {
  defaultMaxDuration,
  defaultMaxSounds,
  groupPermissions,
} from "../db/models/Guild";
import DatabaseGuildManager from "../managers/DatabaseGuildManager";
import DatabaseManager from "../managers/DatabaseManager";

const authManager = new AuthManager();
const dbManager = DatabaseManager.getInstance();

const router = express.Router();

router.get("/all", async (req, res) => {
  dbManager.getUser({ discordId: req.userId }).then((user) => {
    authManager.getDiscordToken(user).then((token) => {
      // console.log(token)
      fetch("https://discord.com/api/users/@me/guilds", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => {
          if (response.status !== 200) {
            res.status(response.status).send({
              status: "error",
              message: response.statusText,
            });
            return;
          }
          response
            .json()
            .then(async (json) => {
              // await req.bot.guilds.fetch();
              let botGuilds = req.bot.guilds.cache;
              let userGuildIds = json.map((item) => item.id);

              let match = {
                $match: {
                  $expr: {
                    $and: [
                      ...(req.userId === process.env.BOT_OWNER
                        ? [{ $in: ["$discordId", userGuildIds] }]
                        : []),
                      { $in: ["$discordId", botGuilds.map((g) => g.id)] },
                    ],
                  },
                },
              };

              let intersectingGuilds =
                await GuildModel.aggregate<GuildResponse>([
                  match,
                  {
                    $lookup: {
                      from: "sounds",
                      localField: "_id",
                      foreignField: "guild",
                      as: "sounds",
                    },
                  },
                  {
                    $project: {
                      id: "$discordId",
                      _id: false,
                      commandPrefix: true,
                      joinSound: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: {
                                $filter: {
                                  input: { $objectToArray: "$joinSounds" },
                                  as: "sound",
                                  cond: { $eq: ["$$sound.k", req.userId] },
                                },
                              },
                              as: "sound",
                              in: "$$sound.v",
                            },
                          },
                          0,
                        ],
                      },
                      banned: {
                        $in: [
                          Types.ObjectId(user.id),
                          { $ifNull: ["$bannedUsers", []] },
                        ],
                      },
                      sounds: {
                        $size: "$sounds",
                      },
                      maxSounds: { $ifNull: ["$maxSounds", defaultMaxSounds] },
                      maxSoundDuration: {
                        $ifNull: ["$maxSoundDuration", defaultMaxDuration],
                      },
                    },
                  },
                ]);

              await Promise.allSettled(
                intersectingGuilds.map(async (guild) => {
                  const botGuild = botGuilds.get(guild.id);
                  if (!botGuild) {
                    return;
                  }
                  const [dbGuild, member] = await Promise.all([
                    dbManager.getGuild({ discordId: botGuild.id }),
                    botGuild.members.fetch(req.userId),
                  ]);

                  const dbGuildManager = new DatabaseGuildManager(dbGuild);
                  try {
                    guild.icon = botGuild.iconURL();
                    guild.name = botGuild.name;
                    guild.owner =
                      botGuild.ownerId === req.userId ||
                      (!!req.userId && req.userId === process.env.BOT_OWNER);

                    guild.userPermissions = dbGuildManager
                      .getMemberGroupPermissions(member)
                      .map((p) => groupPermissions.get(p));

                    guild.roles = botGuild.roles.cache
                      .filter((r) => !r.managed)
                      .map((r) => ({
                        id: r.id,
                        name: r.name,
                        hexColor: r.hexColor,
                      }));
                  } catch (error) {
                    log.error("ERROR:", error);
                    log.error("user id:", req.userId);
                    log.error("in guild", botGuilds.get(guild.id).name);
                    log.error("bot guild", botGuild);
                  }
                })
              );

              res.status(200).send(intersectingGuilds);
            })
            .catch((e) => console.error(e));
        })
        .catch((e) => console.error(e));
    });
  });
});

router.post("/settings/:id", async (req, res) => {
  if (!req.body) {
    _sendError(res, "No data transmitted");
    return;
  }

  const botGuild = await req.bot.guilds.fetch(req.params.id);
  if (!botGuild) {
    _sendError(res, "Server not found");
    return;
  }

  const botUser = botGuild.members.cache.get(req.userId);
  const dbGuild = await dbManager.getGuild({ discordId: req.params.id });
  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  const member = await botGuild.members.fetch(req.userId);
  if (
    !botUser ||
    (!botUser.permissions.has("ADMINISTRATOR") &&
      req.userId !== process.env.BOT_OWNER &&
      !(await dbGuildManager.canManageGuildSettings(member)))
  ) {
    _sendError(res, "User has insufficient permissions");
    return;
  }

  let returnObject: any = {};

  if (req.body.commandPrefix) {
    const validPrefixes = [
      "!",
      "#",
      "+",
      "-",
      "$",
      "§",
      "%",
      "&",
      "\\",
      "(",
      ")",
      "=",
      "?",
      ".",
      ",",
      "|",
      "[",
      "]",
      "^",
      "€",
    ];
    if (validPrefixes.includes(req.body.commandPrefix)) {
      dbGuild.commandPrefix = req.body.commandPrefix;
      returnObject.commandPrefix = req.body.commandPrefix;
    } else {
      _sendError(
        res,
        `The command prefix ${req.body.commandPrefix} is invalid`
      );
      return;
    }
  }

  dbGuild
    .save()
    .then(() => {
      res.status(200).send({
        status: "success",
        message: "All server data saved successfully",
        data: returnObject,
      });
    })
    .catch(() => {
      _sendError(res, "Could not write to database", 500);
    });
});

router.post("/favourite/:action", async (req, res) => {
  if (!req.body.guild) {
    _sendError(res, "Server not provided");
    return;
  }
  const botGuild = await req.bot.guilds.fetch(req.body.guild);
  if (!botGuild) {
    _sendError(res, "Invalid server provided");
    return;
  }

  const dbUser = await dbManager.getUser({ discordId: req.userId });

  switch (req.params.action) {
    case "add": {
      if (!dbUser.favouriteGuilds.includes(req.body.guild)) {
        dbUser.favouriteGuilds.push(req.body.guild);
        await dbUser.save();
      }
      res.status(200).send({
        status: "success",
        message: "Server added to favorites",
        data: req.body.guild,
      });
      break;
    }
    case "remove": {
      if (dbUser.favouriteGuilds.includes(req.body.guild)) {
        dbUser.favouriteGuilds.splice(
          dbUser.favouriteGuilds.indexOf(req.body.guild),
          1
        );
        await dbUser.save();
      }
      res.status(200).send({
        status: "success",
        message: "Server removed from favorites",
        data: req.body.guild,
      });
      break;
    }
    default:
      _sendError(res, "Invalid action");
      return;
  }
});

module.exports = router;

type role = {
  name: string;
  id: string;
  hexColor: string;
};

interface GuildResponse {
  name: string;
  icon: string;
  owner: boolean;
  commandPrefix: string;
  userPermissions: GroupPermissionKey[];
  id: string;
  joinSound: Types.ObjectId;
  banned: boolean;
  sounds: number;
  maxSounds: number;
  maxSoundDuration: number;
  roles: role[];
}
