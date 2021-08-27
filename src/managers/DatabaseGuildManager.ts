import { Guild, GuildMember, TextChannel } from "discord.js";
import IGuild, {
  GroupPermissionKey,
  IPermissionGroup,
} from "../db/interfaces/IGuild";
import ISound from "../db/interfaces/ISound";
import IUser from "../db/interfaces/IUser";
import {
  groupPermissions,
  GroupPermission,
  reverseGroupPermissions,
} from "../db/models/Guild";
import SoundModel from "../db/models/Sound";
import log from "../log";
import DatabaseManager from "./DatabaseManager";
import SoundBoardManager from "./SoundBoardManager";

const dbManager = DatabaseManager.getInstance();

export default class DatabaseGuildManager {
  dbGuild: IGuild;

  constructor(dbGuild: IGuild) {
    this.dbGuild = dbGuild;
  }

  async canUseJoinSound(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      !this.isBanned(dbUser) &&
      this.checkMemberPermission(
        member,
        groupPermissions.get(
          GroupPermission.USE_JOIN_SOUND
        ) as GroupPermissionKey
      )
    );
  }

  async canAddSounds(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      !this.isBanned(dbUser) &&
      this.checkMemberPermission(
        member,
        groupPermissions.get(GroupPermission.ADD_SOUNDS) as GroupPermissionKey
      )
    );
  }

  async canPlaySounds(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      !this.isBanned(dbUser) &&
      this.checkMemberPermission(
        member,
        groupPermissions.get(GroupPermission.PLAY_SOUNDS) as GroupPermissionKey
      )
    );
  }

  async canManageGuildSettings(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      !this.isBanned(dbUser) &&
      (this.isAdminOrOwner(member) ||
        this.checkMemberPermission(
          member,
          groupPermissions.get(
            GroupPermission.MANAGE_GUILD_SETTINGS
          ) as GroupPermissionKey
        ))
    );
  }

  async canManageGroups(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager
      .getUser({ discordId: member.id })
      .catch((e) => {
        log.error(e);
      });
    if (!dbUser) {
      return false;
    }
    return (
      !this.isBanned(dbUser) &&
      (this.isAdminOrOwner(member) ||
        this.checkMemberPermission(
          member,
          groupPermissions.get(
            GroupPermission.MANAGE_GROUPS
          ) as GroupPermissionKey
        ))
    );
  }

  async canBanUsers(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      (!this.isBanned(dbUser) || this.isAdminOrOwner(member)) &&
      (this.isAdminOrOwner(member) ||
        this.checkMemberPermission(
          member,
          groupPermissions.get(GroupPermission.BAN_USERS) as GroupPermissionKey
        ))
    );
  }

  async canDeleteSound(member: GuildMember, sound: ISound): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    return (
      !this.isBanned(dbUser) &&
      (this.isAdminOrOwner(member) ||
        this.checkMemberPermission(
          member,
          groupPermissions.get(
            GroupPermission.DELETE_ALL_SOUNDS
          ) as GroupPermissionKey
        ) ||
        sound.creator.id === dbUser.id)
    );
  }

  isBanned(dbUser: IUser): boolean {
    return this.dbGuild.bannedUsers.includes(dbUser.id);
  }

  isAdminOrOwner(member: GuildMember): boolean {
    return this.isAdmin(member) || this.isOwner(member);
  }

  isAdmin(member: GuildMember): boolean {
    return member.permissions.has("ADMINISTRATOR");
  }

  isOwner(member: GuildMember): boolean {
    return member.guild.ownerId === member.id;
  }

  async maxGuildSoundsReached(): Promise<boolean> {
    let soundCount = await SoundModel.count({
      guild: this.dbGuild,
    }).exec();
    return soundCount >= this.dbGuild.maxSounds;
  }

  async maxMemberSoundsReached(member: GuildMember): Promise<boolean> {
    const dbUser = await dbManager.getUser({ discordId: member.id });
    let soundCount = await SoundModel.count({
      guild: this.dbGuild,
      creator: dbUser,
    }).exec();
    return soundCount >= this.getMaxSoundsPerUser(member);
  }

  checkMemberPermission(
    member: GuildMember,
    permission: GroupPermissionKey
  ): boolean {
    log.debug(permission);
    for (const group of this.getMemberPermissionGroups(member)) {
      if (group.permissions && group.permissions.includes(permission)) {
        return true;
      }
    }
    return false;
  }

  getMemberPermissionGroups(member: GuildMember): IPermissionGroup[] {
    const groups: IPermissionGroup[] = [];
    for (const group of this.dbGuild.permissionGroups) {
      if (
        member.roles.cache
          .map((role, id) => id)
          .some((roleId) => group.discordRoles.includes(roleId)) &&
        group.permissions
      ) {
        groups.push(group);
      }
    }
    return groups;
  }

  getMemberGroupPermissions(member: GuildMember): GroupPermission[] {
    const result: Set<GroupPermission> = new Set();
    const memberGroups = this.getMemberPermissionGroups(member);

    for (const group of memberGroups) {
      for (const permission of group.permissions) {
        result.add(reverseGroupPermissions.get(permission));
      }
    }
    return Array.from(result);
  }

  getMaxSoundsPerUser(member: GuildMember): number {
    if (this.isOwner(member)) {
      return this.dbGuild.maxSounds;
    }
    let result = 0;

    for (const group of this.getMemberPermissionGroups(member)) {
      if (group.maxSoundsPerUser > result) {
        result = group.maxSoundsPerUser;
      }
    }
    return Math.min(result, this.dbGuild.maxSounds);
  }

  getMaxSoundDurationForMember(member: GuildMember): number {
    if (this.isOwner(member)) {
      return this.dbGuild.maxSoundDuration;
    }
    let result = this.dbGuild.maxSoundDuration;

    for (const group of this.getMemberPermissionGroups(member)) {
      if (group.maxSoundDuration > result) {
        result = group.maxSoundDuration;
      }
    }
    return Math.min(this.dbGuild.maxSoundDuration, result);
  }

  async getSoundBoardManager(
    guild: Guild
  ): Promise<SoundBoardManager | undefined> {
    if (!this.dbGuild.soundBoardChannel) {
      return;
    }
    let soundBoardManager = SoundBoardManager.getInstance(guild.id);

    if (
      soundBoardManager &&
      SoundBoardManager.checkChannelPermissions(soundBoardManager.channel)
    ) {
      return soundBoardManager;
    }
    const channel = await guild.channels.fetch(this.dbGuild.soundBoardChannel);
    if (!(channel instanceof TextChannel)) {
      return;
    }

    soundBoardManager = new SoundBoardManager(channel);
    if (SoundBoardManager.checkChannelPermissions(soundBoardManager.channel)) {
      return soundBoardManager;
    }
    return;
  }
}
