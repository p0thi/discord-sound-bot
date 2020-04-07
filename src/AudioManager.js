import path from 'path';
import fs from 'fs';
import DatabaseManager from './DatabaseManager';

import log from '../log'

const guildQueues = new Map();
const guildOptions = new Map();

const dbManager = new DatabaseManager('discord');

export default class AudioManager {

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

        log.debug(`joining channel ${channel.name}...`);
        let connection = await channel.join();
        log.debug(`channel ${channel.name} joined...`);

        if (!guildOptions.has(channel.guild.id)) {
            guildOptions.set(channel.guild.id, {});
        }
        let options = guildOptions.get(channel.guild.id);


        
        return await new Promise((resolve, reject) => {
            if (options.dispatcher) {
                options.dispatcher.off('finish', options.callback);
                options.resolve();
            }
            log.info(`playing sound ${sound.command}`)

            let readStream;
    
            try {
                readStream = dbManager.getFileStream(sound.file);
            }
            catch (e) {
                log.error(`Can't play in ${channel.name}`);
                connection.disconnect();
                reject();
                return;
            }
    
            let dispatcher = connection.play(readStream, { volume: .5, highWaterMark: 1 });
            
    
            options.callback = (reason) => {
                log.info('file ended');
                options.dispatcher.off('finish', options.callback);
                resolve();
                setTimeout(() =>
                    connection.disconnect(),
                    100
                )
            }
            options.dispatcher = dispatcher;
            options.resolve = resolve;
    
            dispatcher.on('finish', options.callback);
        })

    }
}