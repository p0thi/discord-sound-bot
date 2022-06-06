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
import { GroupPermission } from "../../../db/models/Guild";
import CustomApplicationCommand from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import IGuildSlashCommand from "../IGuildCommand";
import { v1 as uuid } from "uuid";
import request from "http-async";
import IPermissionChangeObserver from "../IPermissionChangeObserver";
import log from "../../../log";
import ISound from "../../../db/interfaces/ISound";
import AudioManager from "../../../managers/AudioManager";
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";
import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandStringOption,
} from "@discordjs/builders";
const dbManager = DatabaseManager.getInstance();

export default class PlayCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _playCommands: Map<Guild, PlayCommand> = new Map();
  guild: Guild;
  name: string = "play";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;

  private _permissionObservers: IPermissionChangeObserver[] = [];
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }

  public static getInstance(guild: Guild): PlayCommand {
    if (PlayCommand._playCommands.has(guild)) {
      return PlayCommand._playCommands.get(guild);
    }
    const instance = new PlayCommand(guild);
    PlayCommand._playCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.PLAY_SOUNDS;
    return {
      name: this.name,
      description: "Play sound in current channel",
      forOwner: false,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        return {
          apiCommand: new SlashCommandBuilder()
            .setName(this.name)
            .setDescription("Play sounds")
            .setDefaultPermission(this.defaultPermission)
            .addSubcommand(
              new SlashCommandSubcommandBuilder()
                .setName("sound")
                .setDescription("Sound to play")
                .addStringOption(
                  new SlashCommandStringOption()
                    .setName("name")
                    .setDescription("Command of the sound")
                    // .setAutocomplete(true)
                    .setRequired(true)
                )
            )
            .addSubcommand(
              new SlashCommandSubcommandBuilder()
                .setName("random")
                .setDescription("Play random sound")
            ),
          handler: async (interaction: CommandInteraction) => {
            interaction.deferReply({ ephemeral: true });
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

            if (!(await dbGuildManager.canPlaySounds(member))) {
              interaction.followUp({
                content: "You don't have permission to play sounds",
                ephemeral: true,
              });
              return;
            }

            let sound: ISound;
            switch (subCommand) {
              case "random":
                {
                  sound = await dbManager.getRandomSoundForGuild(dbGuild);
                }
                break;
              default:
                {
                  const soundName = interaction.options.getString("name");
                  console.log(soundName);

                  sound = await dbManager.getSound({
                    guild: dbGuild,
                    command: soundName,
                  });
                }
                break;
            }
            if (!sound) {
              interaction.followUp({
                content: "Sound not found",
                ephemeral: true,
              });
              return;
            }

            new AudioManager().memberPlaySound(
              member,
              sound,
              member.voice.channel
            );

            interaction.followUp({
              content: `Playing sound: ${sound.command}`,
              ephemeral: true,
            });
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
