import path from 'path';
import fs from 'fs';
import DatabaseManager from './DatabaseManager';
import moment from 'moment';

import log from '../log'

const guildQueues = new Map();
const guildOptions = new Map();

const dbManager = new DatabaseManager('discord');

export default class AudioManager {

    async playSound(sound, msg, deleter) {

        if (sound) {
            // msg.reply("**" + sound.command + "** - " + sound.description).then(m => deleter.add(m, 10000));

            if (msg.member.voice.channel) {
                this.play(sound, msg.member.voice.channel).catch(err => console.error(err));
            }
        }
        else {
        }
    }

    async play(sound, channel) {
        return await new Promise(async (resolve, reject) => {

            if (!channel.joinable || !channel.speakable) {
                return
            }

            if (!guildOptions.has(channel.guild.id)) {
                guildOptions.set(channel.guild.id, {});
            }
            let options = guildOptions.get(channel.guild.id);

            log.debug(`joining channel...`);
            let connection;
            try {
                if (options.connection && options.connection.status === 4) {
                    if (options.disconnectTime) {
                        const timeToWait = 300 - Math.abs(moment().diff(options.disconnectTime))

                        if (timeToWait > 0) {
                            log.debug(`waiting ${timeToWait} ms`)
                            await new Promise((resolve) => {
                                setTimeout(resolve, timeToWait)
                            })
                        }
                    }
                }
                connection = await channel.join()
            }
            catch (err) {

                try {
                    channel.join()
                    connection = await channel.join()
                }
                catch (e) {
                    channel.leave()
                    log.error("FATAL")
                    reject();
                    return;
                }
            }
            log.debug(`channel joined...`);

            connection.once('disconnect', () => { 
                log.debug("connection disconnected...");
                resolve();
            })

            if (options.dispatcher) {
                options.dispatcher.off('finish', options.callback);
            }

            if (options.resolve) {
                options.resolve();
            }
            options.resolve = resolve

            options.connection = connection;

            log.info(`playing sound ${sound.command}`)

            let readStream;

            try {
                readStream = dbManager.getFileStream(sound.file);
            }
            catch (e) {
                log.error(`Can't play in ${channel.name}`);
                // connection.disconnect();
                channel.leave();
                reject();
                return;
            }

            let dispatcher = connection.play(readStream, { volume: .5, highWaterMark: 1 });

            options.callback = () => {
                log.info('File ended');
                setTimeout(() => {
                    options.dispatcher.off('finish', options.callback);
                    options.disconnectTime = moment();
                    connection.disconnect();
                    resolve();
                },
                    100
                )
            }
            dispatcher.on('finish', options.callback);

            options.dispatcher = dispatcher;

        })

    }
}