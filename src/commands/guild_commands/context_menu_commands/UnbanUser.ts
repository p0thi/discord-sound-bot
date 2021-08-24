import {
  Guild,
  CommandInteraction,
  ContextMenuInteraction,
  GuildMember,
  MessageOptions,
  MessageEmbed,
  InteractionReplyOptions,
} from "discord.js";
import DatabaseGuildManager from "../../../DatabaseGuildManager";
import DatabaseManager from "../../../DatabaseManager";
import { GroupPermission } from "../../../db/models/Guild";

import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import { IGuildContextMenuCommand } from "../IGuildCommand";
import IPermissionChangeObserver from "../IPermissionChangeObserver";

const dbManager = DatabaseManager.getInstance();

export default class UnbanUser
  extends AObservableCommand
  implements IGuildContextMenuCommand
{
  private static _unbanUserCommands: Map<Guild, UnbanUser> = new Map();
  guild: Guild;
  name: string = "Unban User From Bot";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;

  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  public static getInstance(guild: Guild): UnbanUser {
    if (UnbanUser._unbanUserCommands.has(guild)) {
      return UnbanUser._unbanUserCommands.get(guild);
    }
    const instance = new UnbanUser(guild);
    UnbanUser._unbanUserCommands.set(guild, instance);
    return instance;
  }

  notifyPermissionObservers(permissions: GroupPermission[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  addPermissionObserver(observer: IPermissionChangeObserver): void {
    throw new Error("Method not implemented.");
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.BAN_USERS;
    return {
      name: this.name,
      description: "Unbans a user from the bot",
      forOwner: true,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        return {
          name: this.name,
          type: "USER",
          defaultPermission: this.defaultPermission,
          handler: async (interaction: ContextMenuInteraction) => {
            interaction.deferReply({ ephemeral: true });
            const member: GuildMember = interaction.options.getMember(
              "user"
            ) as GuildMember;

            if (!member) {
              interaction.followUp({
                content: "Error: No user found.",
                ephemeral: true,
              });
              return;
            }
            const [dbUser, dbGuild] = await Promise.all([
              dbManager.getUser({
                discordId: member.id,
              }),
              dbManager.getGuild({ discordId: interaction.guild.id }),
            ]);

            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!(await dbGuildManager.canBanUsers(member))) {
              interaction.followUp({
                content: "Error: You don't have permission to ban users.",
                ephemeral: true,
              });
              return;
            }

            if (!dbGuild.bannedUsers.includes(dbUser.id)) {
              interaction.followUp({
                content: "Error: User is not banned.",
                ephemeral: true,
              });
              return;
            }

            dbGuild.bannedUsers.remove(dbUser);
            await dbGuild.save();
            interaction.followUp({
              content: `${member.displayName} has been **unbanned** from using the bot.`,
              ephemeral: true,
            });
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
