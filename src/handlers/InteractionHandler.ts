import {
  Client,
  DMChannel,
  Interaction,
  MessageComponentInteraction,
  SelectMenuInteraction,
  VoiceChannel,
} from "discord.js";
import { Mongoose, Types } from "mongoose";
import Conversation from "../Conversation";
import IUser from "../db/interfaces/IUser";
import AudioManager from "../managers/AudioManager";
import DatabaseManager from "../managers/DatabaseManager";

const dbManager = DatabaseManager.getInstance();
const audioManager = new AudioManager();

export default class InteractionHandler {
  bot: Client;

  constructor(bot: Client) {
    this.bot = bot;
  }

  start() {
    this.bot.on("interactionCreate", this.handle);
  }

  private async handle(interaction: Interaction): Promise<void> {
    if (interaction.isMessageComponent()) {
      const [intent, origin] = interaction.customId.split("#");

      if (interaction.inGuild()) {
        switch (origin) {
          case "soundboardButton":
            {
              interaction.deferUpdate();
              const dbGuild = await dbManager.getGuild({
                discordId: interaction.guild.id,
              });

              const [sound, member] = await Promise.all([
                dbManager.getSound({
                  command: intent,
                  guild: dbGuild,
                }),
                interaction.guild.members.fetch(interaction.user.id),
              ]);

              if (!sound) {
                break;
              }

              audioManager
                .memberPlaySound(
                  member,
                  sound,
                  member.voice.channel as VoiceChannel
                )
                .then((res) => {
                  if (typeof res === "string") {
                    interaction.followUp({
                      content: res,
                      ephemeral: true,
                    });
                  }
                });
            }
            break;
        }
      }
    }
  }
}
