import path from 'path';
import fs from 'fs';

const guildQueues = new Map();
const guildOptions = new Map();

export default class AudioManager {
    constructor() {
    }

    async play(sound, channel) {
        let connection = await channel.join();

        if (!guildOptions.has(channel.guild.id)) {
            guildOptions.set(channel.guild.id, {});
        }
        let options = guildOptions.get(channel.guild.id);

        
        if (options.dispatcher) {
            options.dispatcher.off('end', options.callback);
        }
        const stream = fs.createReadStream(`${path.dirname(require.main.filename)}/sounds/${sound.filename}`)
        let dispatcher = connection.playArbitraryInput(`${path.dirname(require.main.filename)}/sounds/${sound.filename}`);

        options.callback = (reason) => {
            connection.disconnect();
        }
        options.dispatcher = dispatcher;

        dispatcher.on('end', options.callback);
    }
}