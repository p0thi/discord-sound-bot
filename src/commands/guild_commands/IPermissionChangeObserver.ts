import {
  ApplicationCommand,
  ApplicationCommandPermissions,
  Collection,
  Guild,
} from "discord.js";
import { GroupPermission } from "../../db/models/Guild";
import IGuildSlashCommand, { IGuildContextMenuCommand } from "./IGuildCommand";

export default interface IPermissionChangeObserver {
  onPermissionsChange(
    guild: Guild,
    permissions: GroupPermission[]
  ): Promise<Collection<string, ApplicationCommandPermissions[]>>;
}
