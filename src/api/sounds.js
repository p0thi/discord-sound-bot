import express from 'express'
import fetch from 'node-fetch'
import rateLimit from 'express-rate-limit'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'
import AudioManager from '../AudioManager'
import SoundManager from '../SoundManager'
import fileUpload from 'express-fileupload'
import log from '../../log'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord');
const audioManager = new AudioManager();

const router = express.Router()

const playRateLimit = rateLimit({
    windowMs: process.env.RATE_LIMIT_WINDOW || 15000,
    max: 2,
    skipFailedRequests: true,
    message: {
        status: 'error',
        message: 'Rate limit'
    },
    keyGenerator(req) {
        return req.userId
    }
})

const _sendError = (res, msg, code = 400) => {
    log.error(msg);
    res.status(code).send({
        status: 'error',
        message: msg
    });
}

router.get("/play", playRateLimit, async (req, res) => {
    dbManager.Sound.model.findOne({ _id: req.query.id }).populate('guild').exec().then(sound => {
        const user = req.bot.users.cache.get(req.userId);
        const discordGuild = req.bot.guilds.cache.get(sound.guild.discordId)
        const voiceState = discordGuild.member(user).voice
        const channel = voiceState.channel
        const shouldBlock = req.query.block || true;

        if (!!channel) {
            audioManager.play(sound, channel).then(() => {
                res.status(200).send();
            })
            if (!shouldBlock)
                res.status(200).send();
        }
        else {
            res.status(409).send({
                status: 'error',
                message: 'You have to be in a channel'
            })
        }
    })

})

router.post('/upload', fileUpload(), async (req, res) => {

    const guild = await dbManager.getGuild({ discordId: req.body.guild });
    const command = req.body.command;

    const commandIllegal = await SoundManager.isCommandIllegal(command, guild)
    if (!!commandIllegal) {
        _sendError(res, commandIllegal)
        return;
    }

    const description = req.body.description;

    const descriptionIllegal = SoundManager.isDescriptionIllegal(description)
    if (descriptionIllegal) {
        _sendError(res, descriptionIllegal)
        return;
    }

    const soundManager = new SoundManager();
    const file = req.files.file;

    if (!file) {
        _sendError(res, 'Keine Datei übermittelt')
        return;
    }

    if (!soundManager.checkFileSize(file.size)) {
        _sendError(res, 'Datei ist zu groß');
        return;
    }

    if (!soundManager.checkFileExtension(file.name)) {
        _sendError(res, 'Falsches Dateiformat');
        return;
    }

    if (!soundManager.checkFileMetadata(file.data)) {
        _sendError(res, "Audio zu lang ( >30 sek)");
        return;
    }

    try {
        await soundManager.storeFile(file.data);
    }
    catch (e) {
        _sendError(res, e.message, 500)
        return
    }

    const creator = await dbManager.getUser({ discordId: req.userId });

    let sound;
    try {
        sound = await soundManager.createSound(command, description, guild, creator)
    } catch (e) {
        _sendError(res, e.message, 500)
        soundManager.soundFile.unlink(err => { if (err) log.error(err) })
    }
    res.status(200).send(sound)
})

router.delete('/delete', async (req, res) => {

    const sound = await dbManager.Sound.model.findOne({ _id: req.body.sound }).populate('creator').populate('guild').exec();
    console.log("sound", sound)
    const dbGuild = sound.guild
    const botGuild = req.bot.guilds.cache.get(dbGuild.discordId)

    // console.log('botGuild', botGuild.id)
    // console.log('dbGuild', dbGuild.discordId)
    // res.status(200).send()
    // return

    if (!sound) {
        _sendError(res, "Sound not found", 404)
        return;
    }

    if (!botGuild) {
        _sendError(res, "Discord guild not found", 404)
        return;
    }

    if (!dbGuild) {
        _sendError(res, "Database guild not found", 404)
        return;
    }

    if (sound.creator.discordId !== req.userId && req.uderId !== botGuild.ownerID) {
        _sendError(res, 'Insufficient permissions', 403)
        return;
    }

    try {
        await SoundManager.deleteSound(sound)
        res.status(200).send({
            status: 'success',
            message: 'Sound deleted'
        })
    }
    catch (e) {
        res.status(500).send({
            status: 'error',
            message: 'Could not delete sound'
        })
    }
})

router.post('/joinsound', async (req, res) => {
    // console.log(req.body);
    // _sendError(res,"baum")
    // return;
    let guild;
    if (!req.body.sound) {
        if (!req.body.guild) {
            _sendError(res, "Join-Sound konnte nicht gesetzt bzw. gelöscht werden.")
            return;
        }

        guild = await dbManager.getGuild({ discordId: req.body.guild });
        guild.joinSounds.delete(req.userId)
    }
    else {
        const sound = await dbManager.Sound.model.findOne({ _id: req.body.sound }).populate('guild').exec()
        console.log("sound", sound)
        guild = sound.guild;
        guild.joinSounds.set(req.userId, sound._id)
    }

    try {
        await guild.save();
        res.status(200).send({
            status: 'success',
            message: 'Join-Sound erfolgreich geändert.'
        })
    } catch (e) {
        _sendError(res, "Join-Sound konnte nicht gesetzt bzw. gelöscht werden.", 500)
        return;
    }
})

module.exports = router;
