import path from 'path';
import fs from 'fs';
import DatabaseManager from './DatabaseManager';

import log from '../log'

const guildQueues = new Map();
const guildOptions = new Map();

const dbManager = new DatabaseManager('discord');

export default class AudioManager {
    constructor() {
    }

    async playSound(sound, msg, deleter) {

        if (sound) {
            msg.reply("**" + sound.command + "** - " + sound.description).then(m => deleter.add(m, 10000));

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

        log.info(`joining channel ${channel.name}...`);
        let connection = await channel.join();
        log.info(`channel ${channel.name} joined...`);

        if (!guildOptions.has(channel.guild.id)) {
            guildOptions.set(channel.guild.id, {});
        }
        let options = guildOptions.get(channel.guild.id);


        if (options.dispatcher) {
            options.dispatcher.off('finish', options.callback);
        }
        log.info(`playing sound ${sound.command}`)

        // let filename = `${path.dirname(require.main.filename)}/sounds/${sound.filename}`;

        // let readStream = fs.createReadStream(filename);
        let readStream;

        try {
            readStream = dbManager.getFileStream(sound.file);
        }
        catch (e) {
            log.error(`Can't play in ${channel.name}`);
            connection.disconnect();
            return;
        }


        // let dispatcher = connection.play(`${path.dirname(require.main.filename)}/sounds/${sound.filename}`, { voume: .5 });
        let dispatcher = connection.play(readStream, { volume: .5, highWaterMark: 1 });
        

        options.callback = (reason) => {
            log.info('file ended');
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