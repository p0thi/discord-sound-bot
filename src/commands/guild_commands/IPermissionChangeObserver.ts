import {
  ApplicationCommand,
  ApplicationCommandPermissions,
  Collection,
} from "discord.js";
import { GroupPermission } from "../../db/models/Guild";
import IGuildSlashCommand, { IGuildContextMenuCommand } from "./IGuildCommand";

export default interface IPermissionChangeObserver {
  onPermissionsChange(
    command: IGuildSlashCommand | IGuildContextMenuCommand,
    permissions: GroupPermission[]
  ): Promise<Collection<string, ApplicationCommandPermissions[]>>;
}
