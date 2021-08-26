import {
  ButtonInteraction,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageActionRow,
  MessageAttachment,
  MessageButton,
} from "discord.js";
import DatabaseGuildManager from "../../../DatabaseGuildManager";
import DatabaseManager from "../../../DatabaseManager";
import { GroupPermission } from "../../../db/models/Guild";
import SoundManager from "../../../SoundManager";
import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import IGuildSlashCommand from "../IGuildCommand";
import { v1 as uuid } from "uuid";
import request from "http-async";
import IPermissionChangeObserver from "../IPermissionChangeObserver";
import log from "../../../log";

const dbManager = DatabaseManager.getInstance();

export default class JoinSoundCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _joinSoundCommands: Map<Guild, JoinSoundCommand> = new Map();
  guild: Guild;
  name: string = "join_sound";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;

  private _permissionObservers: IPermissionChangeObserver[] = [];
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  notifyPermissionObservers(permissions: GroupPermission[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  addPermissionObserver(observer: IPermissionChangeObserver): void {
    throw new Error("Method not implemented.");
  }
  public static getInstance(guild: Guild): JoinSoundCommand {
    if (JoinSoundCommand._joinSoundCommands.has(guild)) {
      return JoinSoundCommand._joinSoundCommands.get(guild);
    }
    const instance = new JoinSoundCommand(guild);
    JoinSoundCommand._joinSoundCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.USE_JOIN_SOUND;

    return {
      name: this.name,
      description:
        "Set or disable the sound that will be played, whenever you join a voice channel on the server.",
      forOwner: false,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        return {
          name: this.name,
          description: "Manage your join sound",
          defaultPermission: this.defaultPermission,
          options: [
            {
              name: "set",
              description: "Set your join sound for this server",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "command",
                  description: "Command of the sound",
                  required: true,
                  type: "STRING",
                },
              ],
            },
            {
              name: "disable",
              description: "Disables your join sound for this server",
              type: "SUB_COMMAND",
            },
          ],
          handler: async (interaction: CommandInteraction) => {
            const subCommand = interaction.options.getSubcommand();

            const guild = interaction.guild;
            const [dbGuild, dbUser] = await Promise.all([
              dbManager.getGuild({
                discordId: guild.id,
              }),
              dbManager.getUser({ discordId: interaction.user.id }),
            ]);
            const member = interaction.member as GuildMember;
            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!(await dbGuildManager.canUseJoinSound(member))) {
              interaction.followUp({
                content: "You don't have permission to use join sounds",
                ephemeral: true,
              });
              return;
            }

            switch (subCommand) {
              case "set":
                {
                  interaction.deferReply({ ephemeral: true });
                  const command = interaction.options.getString("command");

                  const sound = await dbManager.getSound({
                    command,
                    guild: dbGuild,
                  });

                  if (!sound) {
                    interaction.followUp({
                      content: "No sound found with that command",
                      ephemeral: true,
                    });
                    return;
                  }

                  dbGuild.joinSounds.set(interaction.user.id, sound.id);
                  await dbGuild.save();

                  interaction.followUp({
                    content: `Your join sound has been set to **${sound.command}**`,
                    ephemeral: true,
                  });
                }
                break;
              case "disable":
                {
                  interaction.deferReply({ ephemeral: true });

                  dbGuild.joinSounds.delete(interaction.user.id);
                  await dbGuild.save();

                  interaction.followUp({
                    content: "Your join sound has been disabled",
                    ephemeral: true,
                  });
                }
                break;
              default:
                interaction.deferReply();
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
