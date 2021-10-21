import express from "express";
import fetch from "node-fetch";
import AuthManager from "./managers/AuthManager";
import { _sendError } from "./utils";
import log from "../log";
import IGuild, { IPermissionGroup } from "../db/interfaces/IGuild";
import { Mongoose, ObjectId } from "mongoose";
import GuildModel, {
  defaultGroupName,
  reverseGroupPermissions,
} from "../db/models/Guild";
import logger from "../log";
import SlashCommandManager from "../managers/SlashCommandManager";
import ContextMenuCommandManager from "../managers/ContextMenuCommandManager";
import DatabaseGuildManager from "../managers/DatabaseGuildManager";
import DatabaseManager from "../managers/DatabaseManager";

const authManager = new AuthManager();
const dbManager = DatabaseManager.getInstance();

const router = express.Router();

router.get("/all", async (req, res) => {
  const result = {};
  for (const [permission, i] of reverseGroupPermissions) {
    result[permission] = i;
  }
  res.status(200).send(result);
});

router.get("/group/all/:guildId", async (req, res) => {
  const [dbGuild, guild] = await Promise.all([
    dbManager.getGuild({ discordId: req.params.guildId }),
    req.bot.guilds.fetch(req.params.guildId),
  ]);

  const member = await guild.members.fetch(req.userId).catch(() => {
    log.warn(`Could not get Member for ${req.userId}`);
  });

  const dbGuildManager = new DatabaseGuildManager(dbGuild);

  if (!member || !dbGuildManager.canManageGroups(member)) {
    _sendError(res, "You do not have permission to manage groups");
    return;
  }
  return res.status(200).json({
    status: "success",
    data: dbGuild.permissionGroups,
  });
});

router.patch("/group/edit/:guild/:id", async (req, res) => {
  const [dbGuild, guild] = await Promise.all([
    dbManager.getGuild({ discordId: req.params.guild }),
    req.bot.guilds.fetch(req.params.guild),
  ]);

  const member = await guild.members.fetch(req.userId).catch(() => {
    log.warn(`Could not get Member for ${req.userId}`);
  });

  const dbGuildManager = new DatabaseGuildManager(dbGuild);

  if (!member || !dbGuildManager.canManageGroups(member)) {
    _sendError(res, "You do not have permission to manage groups");
    return;
  }

  let group = dbGuild.permissionGroups.id(req.params.id);

  if (
    !group &&
    dbGuild.permissionGroups.length === 1 &&
    dbGuild.permissionGroups[0].name === defaultGroupName
  ) {
    group = dbGuild.permissionGroups[0];
  } else if (!group) {
    _sendError(res, "Group not found");
    return;
  }
  const modifiedGroup = Object.assign(group, req.body);

  const savedGuild = await dbGuild.save().catch((err) => {
    log.error(err);
    log.error("Could not edit permission group");
  });

  if (!savedGuild) {
    _sendError(res, "Could not save group");
    return;
  }

  SlashCommandManager.getInstance(req.bot).onPermissionsChange(
    guild,
    undefined
  );

  res.status(200).send({
    status: "success",
    message: "Group edited",
    data: modifiedGroup,
  });
});

router.post("/group/create", async (req, res) => {
  const [dbUser, dbGuild, guild] = await Promise.all([
    dbManager.getUser({ discordId: req.userId }),
    dbManager.getGuild({ discordId: req.body.guild }),
    req.bot.guilds.fetch(req.body.guild),
  ]);

  const member = await guild.members.fetch(req.userId).catch(() => {
    log.warn(`Could not get Member for ${req.userId}`);
  });

  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  if (!member || !dbGuildManager.canManageGroups(member)) {
    _sendError(res, "Insufficient permissions");
    return;
  }

  const newGroups = dbGuild.permissionGroups.addToSet(req.body.data);
  const savedGuild = await dbGuild.save().catch((e) => {
    logger.error("Could not save permission group");
  });

  if (!savedGuild) {
    _sendError(res, "Could not save permission group");
    return;
  }

  SlashCommandManager.getInstance(req.bot).onPermissionsChange(
    guild,
    undefined
  );

  res.status(200).send({
    status: "success",
    message: "Permission group added to server",
    data: newGroups.find((g) => g.name === req.body.data.name),
  });
});

router.delete("/group/delete/:guild/:id", async (req, res) => {
  const [dbUser, dbGuild, guild] = await Promise.all([
    dbManager.getUser({ discordId: req.userId }),
    dbManager.getGuild({ discordId: req.params.guild }),
    req.bot.guilds.fetch(req.params.guild),
  ]);

  const member = await guild.members.fetch(req.userId).catch(() => {
    log.warn(`Could not get Member for ${req.userId}`);
  });

  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  if (!member || !dbGuildManager.canManageGroups(member)) {
    _sendError(res, "Insufficient permissions");
    return;
  }

  const group = dbGuild.permissionGroups.id(req.params.id);
  dbGuild.permissionGroups.remove(group);
  const savedGuild = await dbGuild.save().catch((e) => {
    logger.error("Could not delete permission group");
  });

  if (!savedGuild) {
    _sendError(res, "Could not delete permission group");
    return;
  }
  SlashCommandManager.getInstance(req.bot).onPermissionsChange(
    guild,
    undefined
  );

  res.status(200).send({
    status: "success",
    message: "Permission group deleted from server",
  });
});

module.exports = router;
