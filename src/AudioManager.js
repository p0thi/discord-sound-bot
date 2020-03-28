import path from 'path';
import fs from 'fs';

const guildQueues = new Map();
const guildOptions = new Map();

export default class AudioManager {
    constructor() {
    }

    async playSound(sound, msg, deleter) {

        if (sound) {
            msg.reply("**" + sound.command + "** - " + sound.description).then(m => deleter.add(m));

            if (msg.member.voice.channel) {
                this.play(sound, msg.member.voice.channel).catch(err => console.error(err));
            }
        }
        else {
        }
    }

    async play(sound, channel) {
        if (!channel.joinable || !channel.speakable) {
            return
        }

        console.log("joining channel...");
        let connection = await channel.join();
        console.log("channel joined...");

        if (!guildOptions.has(channel.guild.id)) {
            guildOptions.set(channel.guild.id, {});
        }
        let options = guildOptions.get(channel.guild.id);


        if (options.dispatcher) {
            options.dispatcher.off('finish', options.callback);
        }
        console.log("playing sound:", sound)

        let filename = `${path.dirname(require.main.filename)}/sounds/${sound.filename}`;

        let readStream = fs.createReadStream(filename);


        // let dispatcher = connection.play(`${path.dirname(require.main.filename)}/sounds/${sound.filename}`, { voume: .5 });
        let dispatcher = connection.play(readStream, { voume: .5 });
        

        options.callback = (reason) => {
            console.log('file ended');
            // connection.disconnect(),
            setTimeout(() =>
                connection.disconnect(),
                100
            )
        }
        options.dispatcher = dispatcher;

        dispatcher.on('finish', options.callback);
    }
}