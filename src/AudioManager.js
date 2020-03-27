import path from 'path';
import fs from 'fs';

const guildQueues = new Map();
const guildOptions = new Map();

export default class AudioManager {
    constructor() {
    }

    async play(sound, channel) {
        if (!channel.joinable || !channel.speakable) {
            return
        }
        let connection = await channel.join();
        
        if (!guildOptions.has(channel.guild.id)) {
            guildOptions.set(channel.guild.id, {});
        }
        let options = guildOptions.get(channel.guild.id);
        
        
        if (options.dispatcher) {
            options.dispatcher.off('finish', options.callback);
        }
        console.log("playing sound:", sound)
        let dispatcher = connection.play(`${path.dirname(require.main.filename)}/sounds/${sound.filename}`);
        dispatcher.setVolume(0.5);

        options.callback = (reason) => {
            console.log('file ended');
            setTimeout(() =>
                    channel.leave(),
                    // connection.disconnect(),
                50
            )
        }
        options.dispatcher = dispatcher;

        dispatcher.on('finish', options.callback);
    }
}