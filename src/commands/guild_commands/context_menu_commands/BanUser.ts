import {
  Guild,
  CommandInteraction,
  ContextMenuInteraction,
  GuildMember,
  MessageOptions,
  MessageEmbed,
  InteractionReplyOptions,
} from "discord.js";
import { GroupPermission } from "../../../db/models/Guild";
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";

import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import { IGuildContextMenuCommand } from "../IGuildCommand";
import IPermissionChangeObserver from "../IPermissionChangeObserver";

const dbManager = DatabaseManager.getInstance();

export default class BanUser
  extends AObservableCommand
  implements IGuildContextMenuCommand
{
  private static _banUserCommands: Map<Guild, BanUser> = new Map();
  guild: Guild;
  name: string = "Ban User From Bot";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  notifyPermissionObservers(permissions: GroupPermission[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public static getInstance(guild: Guild): BanUser {
    if (BanUser._banUserCommands.has(guild)) {
      return BanUser._banUserCommands.get(guild);
    }
    const instance = new BanUser(guild);
    BanUser._banUserCommands.set(guild, instance);
    return instance;
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
      description:
        "Bans a user from all interactions with the bot. Banned users can literally do nothing with the bot.",
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

            dbGuild.bannedUsers.addToSet(dbUser);
            await dbGuild.save();
            interaction.followUp({
              content: `${member.displayName} has been **banned** from using the bot.`,
              ephemeral: true,
            });
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
