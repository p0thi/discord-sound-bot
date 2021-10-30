import {
  ButtonInteraction,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageActionRow,
  MessageAttachment,
  MessageButton,
  TextChannel,
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
import DatabaseGuildManager from "../../../managers/DatabaseGuildManager";
import DatabaseManager from "../../../managers/DatabaseManager";
import SoundManager from "../../../managers/SoundManager";
import SoundBoardManager from "../../../managers/SoundBoardManager";
import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "@discordjs/builders";

const dbManager = DatabaseManager.getInstance();

export default class SoundBoardCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _soundBoardCommands: Map<Guild, SoundBoardCommand> = new Map();
  guild: Guild;
  name: string = "board";
  canChangePermission: boolean = false;
  defaultPermission: boolean = false;
  permission: GroupPermission = GroupPermission.MANAGE_GUILD_SETTINGS;

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
  public static getInstance(guild: Guild): SoundBoardCommand {
    if (SoundBoardCommand._soundBoardCommands.has(guild)) {
      return SoundBoardCommand._soundBoardCommands.get(guild);
    }
    const instance = new SoundBoardCommand(guild);
    SoundBoardCommand._soundBoardCommands.set(guild, instance);
    return instance;
  }

  async notifyObservers() {
    await Promise.all(
      this.observers.map((observer) => observer.commandChangeObserved(this))
    );
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    return {
      name: this.name,
      description: "Un-/sets a channel to be a sound board channel",
      forOwner: true,
      permission: this.permission,
      defaultPermission: this.defaultPermission,
      create: (): CustomApplicationCommand => {
        return {
          permission: this.permission,
          apiCommand: new SlashCommandBuilder()
            .setName(this.name)
            .setDescription("Manage the sound board channel")
            .setDefaultPermission(this.defaultPermission)
            .addSubcommand(
              new SlashCommandSubcommandBuilder()
                .setName("set")
                .setDescription("Set the sound board channel")
            )
            .addSubcommand(
              new SlashCommandSubcommandBuilder()
                .setName("unset")
                .setDescription("Unset the sound board channel")
            ),
          handler: async (interaction: CommandInteraction) => {
            const guild = interaction.guild;

            if (!guild) {
              interaction.reply({
                content: "This command has to be used in a server",
                ephemeral: true,
              });
              return;
            }

            interaction.deferReply({ ephemeral: true });

            const subCommand = interaction.options.getSubcommand(false);

            const [dbGuild, member] = await Promise.all([
              dbManager.getGuild({ discordId: guild.id }),
              // dbManager.getUser({ discordId: interaction.user.id }),
              guild.members.fetch(interaction.user.id),
            ]);
            const dbGuildManager = new DatabaseGuildManager(dbGuild);

            if (!dbGuildManager.canManageGuildSettings(member)) {
              interaction.followUp({
                content: "You don't have permission to do this",
                ephemeral: true,
              });
              return;
            }

            const channel = interaction.channel;

            if (!(channel instanceof TextChannel)) {
              interaction.followUp({
                content:
                  "This command can only be used in a normal text channel",
                ephemeral: true,
              });
              return;
            }

            switch (subCommand) {
              case "set":
                {
                  if (!SoundBoardManager.checkChannelPermissions(channel)) {
                    interaction.followUp({
                      content:
                        "I do not have the right permissions in this channel\n" +
                        "Please make sure I have the permissions to **send messsages**, **read the message history**, **view the channel** and **manage the messages in the channel**.",
                      ephemeral: true,
                    });
                    return;
                  }

                  if (!SoundBoardManager.checkChananelAge(channel)) {
                    interaction.followUp({
                      content:
                        "This channel is too old to be used as a sound board. It has to be younger than **two weeks**.",
                      ephemeral: true,
                    });
                    return;
                  }

                  const uid = uuid();

                  channel
                    .createMessageComponentCollector({
                      componentType: "BUTTON",
                      filter: (buttonInteraction: ButtonInteraction) => {
                        return (
                          buttonInteraction.user.id === interaction.user.id &&
                          buttonInteraction.customId.includes(uid)
                        );
                      },
                      max: 1,
                      time: 600000,
                    })
                    .on(
                      "collect",
                      async (buttonInteraction: ButtonInteraction) => {
                        buttonInteraction.deferReply({ ephemeral: true });
                        const request =
                          buttonInteraction.customId.split("#")[0];

                        switch (request) {
                          case "confirm":
                            {
                              SoundBoardManager.getInstance(
                                guild.id
                              )?.deleteSoundBoardMessages();

                              dbGuild.soundBoardChannel = channel.id;
                              const saved = !!(await dbGuild
                                .save()
                                .catch(() => {
                                  log.error(
                                    "Could not save new sound board channel to db"
                                  );
                                }));
                              if (saved) {
                                const newBoard = new SoundBoardManager(channel);
                                const setup = await newBoard.setup();
                                if (setup) {
                                  newBoard.updateMessages();
                                  buttonInteraction.followUp({
                                    content: "Sound board channel set",
                                    ephemeral: true,
                                  });
                                  return;
                                }
                              }
                              buttonInteraction.followUp({
                                content:
                                  "Error while setting sound board channel",
                                ephemeral: true,
                              });
                            }
                            break;
                          default: {
                            buttonInteraction.reply({
                              content: "Cannnel **NOT** set as new sound board",
                              ephemeral: true,
                            });
                          }
                        }
                      }
                    );

                  interaction.followUp({
                    content:
                      "Do you really want to make this channel the sound board channel?\n" +
                      "This will try to delete **ALL messages** in this channel (new and old)!",
                    ephemeral: true,
                    components: [
                      new MessageActionRow().addComponents([
                        new MessageButton()
                          .setLabel("Yes")
                          .setStyle("PRIMARY")
                          .setCustomId(`confirm#${uid}`),
                        new MessageButton()
                          .setLabel("No")
                          .setStyle("DANGER")
                          .setCustomId(`cancel#${uid}`),
                      ]),
                    ],
                  });
                }
                break;
              case "unset":
                {
                  SoundBoardManager.getInstance(guild.id)
                    ?.deleteSoundBoardMessages()
                    .catch(() => {});
                  dbGuild.soundBoardChannel = null;
                  const saved = !!(await dbGuild.save().catch(() => {
                    log.error("Could not delete sound board channel from db");
                  }));

                  if (saved) {
                    interaction.followUp({
                      content: "Sound board channel unset",
                      ephemeral: true,
                    });
                  } else {
                    interaction.followUp({
                      content: "Error removing sound board channel",
                      ephemeral: true,
                    });
                  }
                }
                break;
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
