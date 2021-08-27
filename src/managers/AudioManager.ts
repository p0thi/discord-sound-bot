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

import { GuildMember, Message, StageChannel, VoiceChannel } from "discord.js";
import DatabaseGuildManager from "./DatabaseGuildManager";
import ISound from "../db/interfaces/ISound";
import log from "../log";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const dbManager = DatabaseManager.getInstance();
const rateLimiter = new RateLimiterMemory({
  points: 2,
  duration: 10,
});

export default class AudioManager {
  private static _guildAudioPlayers = new Map<string, AudioPlayer>();
  private static _guildConnectionDisconnectHandlers = new Map<
    string,
    (newState: VoiceConnectionState, oldState: VoiceConnectionState) => void
  >();
  private static _playingResolves = new Map<
    string,
    (value: void | PromiseLike<void>) => void
  >();

  async memberPlaySound(
    member: GuildMember,
    sound: ISound,
    channel: VoiceChannel | StageChannel
  ): Promise<string | true> {
    const dbGuild = await dbManager.getGuild({ discordId: member.guild.id });
    const databaseGuildManager = new DatabaseGuildManager(dbGuild);
    if (!(await databaseGuildManager.canPlaySounds(member))) {
      log.info(`${member.displayName} cannot play sounds`);
      return "User can not play sounds";
    }

    if (
      !channel ||
      channel instanceof StageChannel ||
      !channel.joinable ||
      !channel.speakable
    ) {
      log.info(`Bot cannot join or speak in ${channel}`);
      return "Bot can not join this channel";
    }
    const result = await new Promise<true | string>((resolve, reject) => {
      rateLimiter
        .consume(`${member.id}#${channel.guild.id}`, 1)
        .then((rateRes: RateLimiterRes) => {
          this.play(sound, channel).then(() => resolve(true));
        })
        .catch((rateRes: RateLimiterRes) => {
          resolve(
            `Rate limit exceeded: Wait **${(
              rateRes.msBeforeNext / 1000
            ).toFixed(2)} seconds**`
          );
        });
    });
    return result;
  }

  private async play(sound: ISound, channel: VoiceChannel): Promise<void> {
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

      player.pause();
      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => {
        resolve();
        AudioManager._guildAudioPlayers.delete(channel.guild.id);
        getVoiceConnection(channel.guild.id).disconnect();
      });
      player.once(AudioPlayerStatus.Paused, () => {
        resolve();
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
