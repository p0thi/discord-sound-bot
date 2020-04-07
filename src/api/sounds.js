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
    windowMs: 17500,
    max: 2,
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
    console.log(req.query)
    dbManager.Sound.model.findOne({ _id: req.query.id }).populate('guild').exec().then(sound => {
        const user = req.bot.users.cache.get(req.userId);
        console.log("user", user.id)
        const discordGuild = req.bot.guilds.cache.get(sound.guild.discordId)
        console.log("guild", discordGuild.id)
        const voiceState = discordGuild.member(user).voice
        const channel = voiceState.channel

        if (!!channel) {
            audioManager.play(sound, channel).then(() => {
                res.status(200).send();
            })
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
        _sendError(res, 'File not provided')
        return;
    }

    if (!soundManager.checkFileSize(file.size)) {
        _sendError(res, 'File too big');
        return;
    }

    if (!soundManager.checkFileExtension(file.name)) {
        _sendError(res, 'Wrong file format');
        return;
    }

    if (!soundManager.checkFileMetadata(file.data)) {
        _sendError(res, "Audio to long ( >30 sek)");
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

    const sound = await dbManager.Sound.model.findOne({ _id: req.body.sound }).populate('creator').exec();
    const dbGuild = await dbManager.getGuild({ discordId: req.body.guild });
    const botGuild = req.bot.guilds.cache.get(req.body.guild)

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

module.exports = router;
