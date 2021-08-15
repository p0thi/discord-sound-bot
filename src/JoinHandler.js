import DatabaseManager from './DatabaseManager'
import AudioManager from './AudioManager'
import log from '../log'

const dbManager = new DatabaseManager('discord');
const audioManager = new AudioManager();
export default class JoinHandler {
    constructor(bot) {
        this.bot = bot;
    }

    start() {
        this.bot.on('voiceStateUpdate', (oldState, newState) => this.handle(oldState, newState));
    }

    async handle(oldState, newState) {
        if (newState.member.user.bot) {
            return;
        }

        if (!oldState.channel) {
            if (newState.channel) {

                if (!newState.channel.joinable) {
                    return;
                }

                let guild = await dbManager.getGuild({ discordId: newState.guild.id });
                let soundId = guild.joinSounds.get(newState.member.id)

                if (!soundId) {
                    return;
                }

                let sound = await dbManager.getSoundById(soundId);

                if (!sound) {
                    return;
                }

                audioManager.play(sound, newState.channel);
            }
        }
    }
}
