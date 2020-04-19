import express from 'express'
import fetch from 'node-fetch'
import rateLimit from 'express-rate-limit'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'
import AudioManager from '../AudioManager'
import SoundManager from '../SoundManager'
import fileUpload from 'express-fileupload'
import log from '../../log'
import { _sendError } from './utils'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord');
const audioManager = new AudioManager();

const router = express.Router()

const playRateLimit = rateLimit({
    windowMs: process.env.RATE_LIMIT_WINDOW,
    max: 2,
    skipFailedRequests: true,
    message: {
        status: 'error',
        message: `2 Befehle alle ${Math.ceil(process.env.RATE_LIMIT_WINDOW / 1000)} Sekunden`
    },
    keyGenerator(req) {
        return req.userId
    }
})

// const _sendError = (res, msg, code = 400) => {
//     log.error(msg);
//     res.status(code).send({
//         status: 'error',
//         message: msg
//     });
// }

router.get("/play", playRateLimit, async (req, res) => {
    if (!req.query.id) {
        _sendError(res, 'Id nicht angegeben');
        return;
    }
    log.silly(req.query.id)

    let sound;
    let dbGuild
    if (req.query.id === "random" && req.query.guild) {
        dbGuild = await dbManager.getGuild({ discordId: req.query.guild })
        log.silly(dbGuild)
        sound = (await dbManager.getRandomSoundForGuild(dbGuild._id))[0]
        log.silly(sound)
    }
    else {
        sound = await dbManager.getSoundById(req.query.id)
        try {
            dbGuild = await dbManager.getGuild({ _id: sound.guild })
        }
        catch(err) {
            _sendError(res, "Server nicht in der Datenbank gefunden")
            return;
        }
    }

    if (!sound) {
        _sendError(res, "Sound nicht gefunden");
        return;
    }

    const user = req.bot.users.cache.get(req.userId);
    if (!user) {
        _sendError(res, "Benutzer nicht gefunden");
        return;
    }

    const discordGuild = req.bot.guilds.cache.get(dbGuild.discordId)
    if (!discordGuild) {
        _sendError(res, "Discord Server nicht gefunden");
        return;
    }

    const guildMember = discordGuild.member(user);
    if (!guildMember) {
        _sendError(res, "Nutzer auf diesem Server nicht gefunden")
        return
    }

    const voiceState = guildMember.voice
    if (!voiceState) {
        _sendError(res, "Voice Status des Users nicht ermittelbar")
        return
    }

    const channel = voiceState.channel
    if (!channel) {
        _sendError(res, 'You have to be in a channel', 409)
        return
    }

    const shouldBlock = req.query.block || true;

    audioManager.play(sound, channel).then(() => {
        res.status(200).send();
    })
    if (!shouldBlock || shouldBlock === "false") {
        res.status(200).send();
    }

})

router.get("/listen/:id", async (req, res) => {
    console.log(req.params.id)
    const sound = await dbManager.Sound.model.findOne({ _id: req.params.id }).populate("guild").exec();
    if (!sound) {
        _sendError(res, "Sound nicht verfügbar")
        return
    }

    const botGuild = req.bot.guilds.cache.get(sound.guild.discordId);
    if (!botGuild) {
        _sendError(res, "Discord Server nicht verfügbar")
        return
    }

    const botUser = req.bot.users.cache.get(req.userId)
    if (!botUser) {
        _sendError(res, "Nutzer nicht gefunden");
        return;
    }

    if (req.userId !== process.env.BOT_OWNER) {
        if (!botGuild.member(req.userId)) {
            _sendError(res, "Darf sound nicht spielen");
            return;
        }
    }

    const file = await dbManager.getFile(sound.file)
    if (!file) {
        _sendError(res, "Datei nicht gefunden", 500);
        return;
    }

    const ext = file.filename.split('.').pop()
    console.log(ext)
    const fileStream = dbManager.getFileStream(sound.file)
    res.setHeader('Content-Type', `audio/${ext}`)
    fileStream.pipe(res)
    // res.status(200).send()
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

router.get('/guildsounds/:id', async (req, res) => {
    const botGuild = req.bot.guilds.cache.get(req.params.id)
    if (!botGuild) {
        _sendError(res, "Server nicht gefunden");
        return;
    }
    if (!botGuild.member(req.userId) && req.userId !== process.env.BOT_OWNER) {
        _sendError(res, "Nutzer nicht auf dem Srever");
        return;
    }

    const dbGuild = await dbManager.getGuild({ discordId: req.params.id })
    if (!dbGuild) {
        _sendError(res, "Server nicht in der Datenbank vorhanden.");
        return;
    }

    let sounds = await dbManager.Sound.model.find({ guild: dbGuild }).populate('creator').exec();
    sounds = sounds.map(sound => {
        return {
            id: sound._id,
            command: sound.command,
            description: sound.description,
            createdAt: sound.createdAt,
            creator: sound.creator.discordId === req.userId
        }
    });

    res.status(200).send(sounds);
})

router.post('/favourite/:action', async (req, res) => {
    if (!req.body.sound) {
        _sendError(res, "Sound nicht angegeben");
        return;
    }
    const sound = await dbManager.Sound.model.findOne({ _id: req.body.sound }).populate('guild').exec()
    if (!sound) {
        _sendError(res, "Ungültiger Sound angegeben");
        return;
    }

    const botMember = req.bot.guilds.cache.get(sound.guild.discordId).member(req.userId);
    if (!botMember && req.userId !== process.env.BOT_OWNER) {
        _sendError(res, "Nutzer hat nicht die nötigen Rechte")
        return;
    }

    const dbUser = await dbManager.getUser({ discordId: req.userId })

    switch (req.params.action) {
        case 'add': {
            if (!dbUser.favouriteSounds.includes(req.body.sound)) {
                dbUser.favouriteSounds.push(req.body.sound)
                await dbUser.save();
            }
            res.status(200).send({
                status: "success",
                message: "Sound zu Favoriten hinzugefügt",
                data: req.body.sound
            })
            break;
        }
        case 'remove': {
            if (dbUser.favouriteSounds.includes(req.body.sound)) {
                dbUser.favouriteSounds.splice(dbUser.favouriteSounds.indexOf(req.body.sound), 1)
                await dbUser.save();
            }
            res.status(200).send({
                status: "success",
                message: "Server von Favoriten entfernt",
                data: req.body.sound
            })
            break;
        }
        default:
            _sendError(res, 'Aktion nicht gültig')
            return
    }
})

module.exports = router;
