import { Client, StageChannel, VoiceState } from "discord.js";
import log from "../log";
import AudioManager from "../managers/AudioManager";
import DatabaseGuildManager from "../managers/DatabaseGuildManager";
import DatabaseManager from "../managers/DatabaseManager";

const dbManager = DatabaseManager.getInstance();
const audioManager = new AudioManager();
export default class JoinHandler {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }

  start() {
    this.bot.on("voiceStateUpdate", (oldState, newState) =>
      this.handle(oldState, newState)
    );
  }

  async handle(oldState: VoiceState, newState: VoiceState) {
    if (newState.member.user.bot) {
      return;
    }

    if (!oldState.channel) {
      if (newState.channel) {
        if (!newState.channel.joinable) {
          return;
        }

        let guild = await dbManager.getGuild({ discordId: newState.guild.id });
        const dbGuildManager = new DatabaseGuildManager(guild);

        if (!(await dbGuildManager.canUseJoinSound(newState.member))) {
          log.info("Member can not use join sounds");
          return;
        }

        let soundId = guild.joinSounds.get(newState.member.id);

        if (!soundId) {
          return;
        }

        let sound = await dbManager.getSoundById(soundId);

        if (!sound) {
          return;
        }

        if (newState.channel instanceof StageChannel) {
          return;
        }

        audioManager.memberPlaySound(newState.member, sound, newState.channel);
      }
    }
  }
}
