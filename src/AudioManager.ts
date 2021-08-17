import DatabaseManager from "./DatabaseManager";

import {
  AudioPlayerStatus,
  AudioPlayer,
  joinVoiceChannel,
  getVoiceConnection,
  createAudioResource,
  createAudioPlayer,
  VoiceConnectionState,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

import log from "./log";
import ISound from "./db/interfaces/ISound";
import { Message, VoiceChannel } from "discord.js";

const dbManager = new DatabaseManager("discord");

export default class AudioManager {
  private static _guildAudioPlayers = new Map<string, AudioPlayer>();
  private static _guildConnectionDisconnectHandlers = new Map<
    string,
    (newState: VoiceConnectionState, oldState: VoiceConnectionState) => void
  >();

  async playSound(sound: ISound, msg: Message, args: string[]) {
    if (sound) {
      let channel = msg.member.voice.channel;

      if (msg.author.id === process.env.BOT_OWNER) {
        if (args[1]) {
          const argsChannel = await msg.guild.channels.resolve(args[1]);
          if (argsChannel && argsChannel.type === "GUILD_VOICE") {
            channel = argsChannel as VoiceChannel;
          }
        }
      }

      if (channel && channel instanceof VoiceChannel) {
        this.play(sound, channel).catch((err) => console.error(err));
      }
    } else {
    }
  }

  play(sound: ISound, channel: VoiceChannel) {
    return new Promise<void>(async (resolve, reject) => {
      if (!channel.joinable || !channel.speakable) {
        return;
      }

      const joinOptions = {
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      };

      try {
        joinVoiceChannel(joinOptions);
      } catch (err) {
        getVoiceConnection(channel.guild.id)?.destroy();
        log.error("FATAL");
        reject();
        return;
      }

      log.info(`playing sound "${sound.command}" in ${channel.guild.name}`);

      let readStream;

      try {
        readStream = dbManager.getFileStream(sound.file);
      } catch (e) {
        log.error(`Can't play in ${channel.name}`);
        reject();
        return;
      }

      if (!AudioManager._guildAudioPlayers.has(channel.guild.id)) {
        const newPlayer = createAudioPlayer();
        AudioManager._guildAudioPlayers.set(channel.guild.id, newPlayer);
      }
      const player = AudioManager._guildAudioPlayers.get(channel.guild.id);
      const resource = createAudioResource(readStream, { inlineVolume: true });
      resource.volume?.setVolume(0.5);

      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => {
        AudioManager._guildAudioPlayers.delete(channel.guild.id);
        getVoiceConnection(channel.guild.id).disconnect();
      });

      const subscription = getVoiceConnection(channel.guild.id).subscribe(
        player
      );
      subscription.connection.off(
        VoiceConnectionStatus.Disconnected,
        AudioManager._guildConnectionDisconnectHandlers.get(channel.guild.id) ||
          (() => {})
      );
      const newHandler = async (
        newState: VoiceConnectionState,
        oldState: VoiceConnectionState
      ) => {
        try {
          await Promise.race([
            entersState(
              subscription.connection,
              VoiceConnectionStatus.Signalling,
              5_000
            ),
            entersState(
              subscription.connection,
              VoiceConnectionStatus.Connecting,
              5_000
            ),
          ]);
        } catch (error) {
          subscription.connection.destroy();
        }
      };
      AudioManager._guildConnectionDisconnectHandlers.set(
        channel.guild.id,
        newHandler
      );
      subscription.connection.on(
        VoiceConnectionStatus.Disconnected,
        newHandler
      );
    });
  }
}
