import express from "express";
import fetch from "node-fetch";
import DatabaseManager from "../DatabaseManager";
import AuthManager from "./managers/AuthManager";
import { _sendError } from "./utils";
import log from "../log";
import IGuild, { IPermissionGroup } from "../db/interfaces/IGuild";
import { Mongoose, ObjectId } from "mongoose";
import GuildModel, { reverseGroupPermissions } from "../db/models/Guild";
import DatabaseGuildManager from "../DatabaseGuildManager";
import logger from "../log";

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

  const member = await guild.members.fetch(req.bot.user.id);

  const dbGuildManager = new DatabaseGuildManager(dbGuild);

  if (!dbGuildManager.canManageGroups(member)) {
    _sendError(res, "You do not have permission to manage groups");
    return;
  }

  res.status(200).send({
    status: "success",
    data: dbGuild.permissionGroups,
  });
});

router.patch("/group/edit/:guild/:id", async (req, res) => {
  const [dbGuild, guild] = await Promise.all([
    dbManager.getGuild({ discordId: req.params.guild }),
    req.bot.guilds.fetch(req.params.guild),
  ]);

  const member = await guild.members.fetch(req.bot.user.id);

  const dbGuildManager = new DatabaseGuildManager(dbGuild);

  if (!dbGuildManager.canManageGroups(member)) {
    _sendError(res, "You do not have permission to manage groups");
    return;
  }

  const group = dbGuild.permissionGroups.id(req.params.id);

  if (!group) {
    _sendError(res, "Group not found");
    return;
  }

  const modifiedGroup = Object.assign(group, req.body);
  const savedGuild = await dbGuild.save().catch((err) => {
    log.error("Could not edit permission group");
  });

  if (!savedGuild) {
    _sendError(res, "Could not save group");
    return;
  }

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

  const member = await guild.members.fetch(req.userId);

  if (!member) {
    _sendError(res, "User is not in the server");
    return;
  }

  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  if (!dbGuildManager.canManageGroups(member)) {
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

  const member = await guild.members.fetch(req.userId);

  if (!member) {
    _sendError(res, "User is not in the server");
    return;
  }

  const dbGuildManager = new DatabaseGuildManager(dbGuild);
  if (!dbGuildManager.canManageGroups(member)) {
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

  res.status(200).send({
    status: "success",
    message: "Permission group deleted from server",
  });
});

module.exports = router;
