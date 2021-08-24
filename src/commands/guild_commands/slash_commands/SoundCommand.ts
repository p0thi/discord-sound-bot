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

export default class SoundCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _tournamentCommands: Map<Guild, SoundCommand> = new Map();
  guild: Guild;
  name: string = "sound";
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
  public static getInstance(guild: Guild): SoundCommand {
    if (SoundCommand._tournamentCommands.has(guild)) {
      return SoundCommand._tournamentCommands.get(guild);
    }
    const instance = new SoundCommand(guild);
    SoundCommand._tournamentCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const permission = GroupPermission.ADD_SOUNDS;
    const templateDbGuild = await dbManager
      .getGuild({
        discordId: this.guild.id,
      })
      .catch((e) => console.error(e));
    return {
      name: this.name,
      description: "Add, download and remove sounds from the bot.",
      forOwner: false,
      defaultPermission: this.defaultPermission,
      permission,
      create: (): CustomApplicationCommand => {
        return {
          name: this.name,
          description: "Manage sounds",
          defaultPermission: this.defaultPermission,
          options: [
            {
              name: "add",
              description: "Add a sound to the bot",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "command",
                  description: "command of the sound",
                  required: true,
                  type: "STRING",
                },
                {
                  name: "description",
                  description: "description of the sound",
                  required: true,
                  type: "STRING",
                },
              ],
            },
            {
              name: "remove",
              description: "Remove a sound from the bot",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "command",
                  description: "command of the sound",
                  required: true,
                  type: "STRING",
                },
              ],
            },
            {
              name: "download",
              description: "Download a sound file from the bot",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "command",
                  description: "command of the sound",
                  required: true,
                  type: "STRING",
                },
              ],
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

            if (!(await dbGuildManager.canAddSounds(member))) {
              interaction.followUp({
                content: "You don't have the permission to add/remove sounds",
                ephemeral: true,
              });
              return;
            }

            switch (subCommand) {
              case "add":
                {
                  interaction.deferReply({ ephemeral: true });
                  const command = interaction.options.getString("command");
                  const description =
                    interaction.options.getString("description");

                  const commandReason = await SoundManager.isCommandIllegal(
                    command,
                    dbGuild
                  );
                  if (commandReason) {
                    interaction.followUp({
                      content: commandReason,
                      ephemeral: true,
                    });
                    return;
                  }

                  const descriptionReason =
                    SoundManager.isDescriptionIllegal(description);
                  if (descriptionReason) {
                    interaction.followUp({
                      content: descriptionReason,
                      ephemeral: true,
                    });
                    return;
                  }

                  const messageCollector =
                    interaction.channel.createMessageCollector({
                      filter: (m: Message) =>
                        m.author.id === interaction.user.id,
                      time: 60000,
                    });

                  const soundManager = new SoundManager(dbGuild);
                  const uid = uuid();

                  const buttonCollector =
                    interaction.channel.createMessageComponentCollector({
                      componentType: "BUTTON",
                      time: 60000,
                      filter: (b) => b.user.id === interaction.user.id,
                    });
                  buttonCollector.on("collect", async (buttonInteraction) => {
                    if (buttonInteraction.customId === `abort#${uid}`) {
                      buttonInteraction.reply({
                        content: "Cancelled",
                        ephemeral: true,
                      });
                      buttonCollector.stop();
                      messageCollector.stop();
                      return;
                    }
                  });

                  messageCollector.on("collect", async (collected) => {
                    if (collected.attachments.size !== 1) {
                      interaction.followUp({
                        content: "You need to attach exactly one sound file",
                        ephemeral: true,
                      });
                      return;
                    }

                    const attachment = collected.attachments.first();
                    const resp = await request("GET", attachment.url);

                    const duration = await soundManager.getFileDuration(
                      resp.content
                    );

                    if (!duration) {
                      interaction.followUp({
                        content:
                          "Could not get audio metadata from file. Wrong file format?",
                        ephemeral: true,
                      });
                      return;
                    }

                    const errorReason = await soundManager.checkFilePermissions(
                      member,
                      {
                        size: attachment.size,
                        duration,
                        name: attachment.name,
                      }
                    );

                    if (errorReason) {
                      interaction.followUp({
                        content: `${member.displayName}: ${errorReason}\nAborting...`,
                        ephemeral: true,
                      });
                      messageCollector.stop();
                      buttonCollector.stop();
                      return;
                    }

                    soundManager.createUniqueFilename(attachment.name);
                    const file = await soundManager.storeFile(resp.content);
                    const sound = await soundManager
                      .createSound(command, description, dbGuild, dbUser)
                      .catch((e) => {
                        log.error("Could not save the sound to the database");
                        dbManager.unlinkFile(file);
                      });

                    if (!sound) {
                      interaction.followUp({
                        content: "Error. Could not save the sound",
                        ephemeral: true,
                      });
                      return;
                    }

                    messageCollector.stop();
                    buttonCollector.stop();

                    interaction.followUp({
                      content: `${member.displayName}: Sound **${sound.command}** added!`,
                      ephemeral: true,
                    });
                    collected
                      .delete()
                      .catch((e) =>
                        log.warn("could not delete sound file message")
                      );
                  });

                  interaction.followUp({
                    content: `Please send me the audio file now in **FLAC** or **MP3** format.`,
                    components: [
                      new MessageActionRow().addComponents([
                        new MessageButton()
                          .setCustomId(`abort#${uid}`)
                          .setLabel("Abort")
                          .setStyle("SECONDARY"),
                      ]),
                    ],
                    ephemeral: true,
                  });
                }
                break;
              case "remove":
                {
                  interaction.deferReply({ ephemeral: true });
                  const command = interaction.options.getString("command");
                  const sound = await dbManager.getSound({
                    command,
                    guild: dbGuild,
                  });

                  if (!sound) {
                    interaction.followUp({
                      content: "Could not find the sound",
                      ephemeral: true,
                    });
                    return;
                  }

                  if (!dbGuildManager.canDeleteSound(member, sound)) {
                    interaction.followUp({
                      content:
                        "You don't have the permission to remove this sound",
                      ephemeral: true,
                    });
                    return;
                  }

                  await SoundManager.deleteSound(sound);
                  interaction.followUp({
                    content: `${member.displayName}: Sound **${sound.command}** removed!`,
                    ephemeral: true,
                  });
                }
                break;
              case "download":
                {
                  const command = interaction.options.getString("command");
                  let sound = await dbManager.getSound({
                    guild: dbGuild,
                    command,
                  });
                  if (!sound) {
                    interaction.reply({
                      content: "Could not find the sound",
                      ephemeral: true,
                    });
                    return;
                  }

                  let stream = dbManager.getFileStream(sound.file._id);
                  let file = await dbManager.getFile(sound.file._id);
                  let attachment = new MessageAttachment(stream, file.filename);
                  interaction.reply({
                    content: `<@${member.id}>Here is your file :smirk:`,
                    files: [attachment],
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
