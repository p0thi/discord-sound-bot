import { hyperlink } from "@discordjs/builders";
import {
  ApplicationCommand,
  ApplicationCommandOption,
  ApplicationCommandOptionType,
  CommandInteraction,
  EmbedField,
  Guild,
  MessageOptions,
  MessagePayload,
} from "discord.js";
import DatabaseManager from "../../../DatabaseManager";
import { GroupPermissionKey } from "../../../db/interfaces/IGuild";
import { GroupPermission, groupPermissions } from "../../../db/models/Guild";
import ContextMenuCommandCreator, {
  ContextMenuCommandTemplate,
} from "../../ContextMenuCommandCreator";
import CustomApplicationCommand from "../../CustomApplicationCommand";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import IGuildSlashCommand from "../IGuildCommand";
import IPermissionChangeObserver from "../IPermissionChangeObserver";

const dbManager = DatabaseManager.getInstance();

export default class HelpCommand
  extends AObservableCommand
  implements IGuildSlashCommand
{
  private static _helpCommands: Map<Guild, HelpCommand> = new Map();
  guild: Guild;
  name: string = "help";
  canChangePermission: boolean = false;
  defaultPermission: boolean = true;

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
  public static getInstance(guild: Guild): HelpCommand {
    if (HelpCommand._helpCommands.has(guild)) {
      return HelpCommand._helpCommands.get(guild);
    }
    const instance = new HelpCommand(guild);
    HelpCommand._helpCommands.set(guild, instance);
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
      description: "Shows a help message for all commands",
      forOwner: false,
      defaultPermission: this.defaultPermission,
      create: (): CustomApplicationCommand => {
        return {
          name: this.name,
          description: "Shows help message",
          type: "CHAT_INPUT",
          defaultPermission: this.defaultPermission,
          async handler(interaction: CommandInteraction) {
            interaction.deferReply({ ephemeral: true });
            const guild = interaction.guild;

            if (!guild) {
              interaction.followUp({
                content: "This command can only be used in a server",
                ephemeral: true,
              });
              return;
            }

            const dbGuild = await dbManager.getGuild({
              discordId: guild.id,
            });

            const slashCommandTemplates = await Promise.all(
              (
                await SlashCommandCreator.getAllGuildSlashCommands(guild)
              ).map(async (c) => await c.generateTemplate())
            );
            const contextMenuCommandTemplates = await Promise.all(
              (
                await ContextMenuCommandCreator.getAllGuildContextMenuCommands(
                  guild
                )
              ).map(async (c) => await c.generateTemplate())
            );
            const options = {
              content:
                `All commands with an explaination and information about the needed permissions to issue the command.\n` +
                `Most of all the commands functionality can be used on the website ${hyperlink(
                  "sounds.pothi.eu",
                  `https://sounds.pothi.eu/#/guilds?guild=${dbGuild.discordId}`
                )} :nerd:`,
              embeds: [
                {
                  title: "All sound commands",
                  description: `Commands, that are triggered in the chat by typing a the sever prefix "**${dbGuild.commandPrefix}**" followed by the command`,
                  fields: [
                    {
                      name: `${dbGuild.commandPrefix}\<sound\>`,
                      value:
                        `\`Permission needed: Yes ↣ ${groupPermissions.get(
                          GroupPermission.PLAY_SOUNDS
                        )}\`` +
                        `\nPlays the sound with the command **\<sound\>** in the users current voice channel`,
                    },
                    {
                      name: `${dbGuild.commandPrefix}random`,
                      value:
                        `\`Permission needed: Yes ↣ ${groupPermissions.get(
                          GroupPermission.PLAY_SOUNDS
                        )}\`` +
                        `\nPlays a random sound of the guild in the users current voice channel`,
                    },
                  ],
                },
                {
                  title: "All slash commands",
                  description:
                    'Commands, that are triggered in the chat by typing a "/" followed by the command',
                  fields: [
                    SlashCommandCreator.globalCommands.map((c) => ({
                      name: `/${c.command.name}`,
                      value: `${c.description}`,
                    })),
                    ...HelpCommand.templatesToFields(
                      slashCommandTemplates,
                      "/"
                    ),
                  ],
                },
                {
                  title: "All user context menu commands",
                  description:
                    'Commands, that are triggered by right clicking on a user and selecting the interaction under "Apps"',
                  fields: HelpCommand.templatesToFields(
                    contextMenuCommandTemplates
                  ),
                },
              ],
            } as MessageOptions;
            interaction.followUp(new MessagePayload(interaction, options));
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }

  static commandToDecriptionLayer(
    template: SlashCommandTemplate | ContextMenuCommandTemplate
  ): LayerDescription {
    const command = template.create();
    const result: LayerDescription = {
      name: command.name,
      description: command.description,
      type: "COMMAND",
      permission: groupPermissions.get(template.permission),
      options: command.options?.map(HelpCommand.optionToDescriptionLayer),
    };
    return result;
  }

  private static optionToDescriptionLayer(
    option: ApplicationCommandOption
  ): LayerDescription {
    const result: LayerDescription = {
      name: option.name,
      description: option.description,
      type: option.type,
      required: option.required,
    };
    if (option.type === "SUB_COMMAND_GROUP" || option.type === "SUB_COMMAND") {
      result.options = option.options?.map(
        HelpCommand.optionToDescriptionLayer
      );
    }
    return result;
  }

  static templatesToFields(
    templates: (SlashCommandTemplate | ContextMenuCommandTemplate)[],
    prefix: string = ""
  ): EmbedField[] {
    return templates.map(
      (template) =>
        ({
          name: `${prefix}${template.name}`,
          value: `\`Permission needed: ${
            template.defaultPermission ? "No" : "Yes"
          } ↣ ${
            template.permission
              ? groupPermissions.get(template.permission)
              : "None"
          }\`\n${template.description}`,
        } as EmbedField)
    );
  }
}

export interface LayerDescription {
  name: string;
  type: ApplicationCommandOptionType | "COMMAND";
  permission?: GroupPermissionKey;
  description: string;
  required?: boolean;
  options?: LayerDescription[];
}
