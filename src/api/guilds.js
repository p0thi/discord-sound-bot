import express from 'express'
import fetch from 'node-fetch'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'
import { _sendError } from './utils'
import log from '../../log'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord')

const router = express.Router()

router.get("/all", async (req, res) => {
    dbManager.getUser({ discordId: req.userId }).then(user => {
        authManager.getDiscordToken(user).then(token => {
            // console.log(token)
            fetch('https://discord.com/api/users/@me/guilds', {
                method: 'GET', headers: { Authorization: `Bearer ${token}` }
            }).then(response => {
                if (response.status !== 200) {
                    console.log(response)
                    res.status(response.status).send({
                        status: "error",
                        message: response.statusText
                    })
                    return;
                }
                response.json().then(async json => {

                    let botGuilds = req.bot.guilds.cache;
                    let userGuildIds = json.map(item => item.id);

                    let match = { $match: { $expr: { $in: ["$discordId", userGuildIds] } } }
                    if (req.userId === process.env.BOT_OWNER) {
                        match = { $match: {} }
                    }

                    let intersectingGuilds = await dbManager.Guild.model.aggregate([
                        match,
                        {
                            $lookup: {
                                from: "sounds",
                                localField: "_id",
                                foreignField: "guild",
                                as: "sounds"
                            }
                        },
                        {
                            $project: {
                                id: "$discordId",
                                _id: false,
                                commandPrefix: true,
                                joinSound: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: { $objectToArray: "$joinSounds" },
                                                        as: 'sound',
                                                        cond: { $eq: ["$$sound.k", req.userId] }
                                                    }
                                                },
                                                as: "sound",
                                                in: "$$sound.v"
                                            }
                                        },
                                        0
                                    ]
                                },
                                sounds: {
                                    $size: "$sounds"
                                    // $map: {
                                    //     input: "$sounds",
                                    //     as: "sound",
                                    //     in: {
                                    //         id: "$$sound._id",
                                    //         command: "$$sound.command",
                                    //         description: "$$sound.description",
                                    //         creator: { $eq: ["$$sound.creator", user._id] }
                                    //     }
                                    // }
                                }
                            }
                        },
                    ]).exec()

                    intersectingGuilds.forEach(guild => {
                        let botGuild = botGuilds.get(guild.id)
                        try {
                            guild.icon = botGuild.iconURL()
                            guild.name = botGuild.name
                            guild.owner = botGuild.ownerID === req.userId
                            guild.editable = req.userId === process.env.BOT_OWNER || botGuild.member(req.userId).hasPermission("ADMINISTRATOR")
                        } catch (error) {
                            log.error('ERROR:', error)
                            log.error("user id:", req.userId)
                            log.error('in guild', botGuilds.get(guild.id).name)
                            log.error('bot guild', botGuild)
                        }
                    })

                    res.status(200).send(intersectingGuilds);
                }).catch(e => console.error(e))

            }).catch(e => console.error(e))
        })
    })
})

router.post('/settings/:id', async (req, res) => {
    if (!req.body) {
        _sendError(res, "Keine Daten übermittelt");
        return;
    }

    const botGuild = await req.bot.guilds.fetch(req.params.id);
    if (!botGuild) {
        _sendError(res, "Server konnte nicht gefunden werden");
        return;
    }

    const botUser = botGuild.member(req.userId);
    if (!botUser || (!botUser.hasPermission("ADMINISTRATOR") && req.userId !== process.env.BOT_OWNER)) {
        _sendError(res, "Nutzer hat nicht die nötigen Rechte.");
        return;
    }

    const dbGuild = await dbManager.getGuild({ discordId: req.params.id });

    let returnObject = {};

    if (req.body.commandPrefix) {
        const validPrefixes = [
            "!",
            "#",
            "+",
            "-",
            "$",
            "§",
            "%",
            "&",
            "\\",
            "(",
            ")",
            "=",
            "?",
            ".",
            ",",
            "|",
            "[",
            "]",
            "^",
            "€"
        ]
        if (validPrefixes.includes(req.body.commandPrefix)) {
            dbGuild.commandPrefix = req.body.commandPrefix
            returnObject.commandPrefix = req.body.commandPrefix
        }
        else {
            _sendError(res, `Des Kommando-Symbol ${req.body.commandPrefix} ist nicht gültig`)
            return;
        }
    }

    dbGuild.save().then(() => {
        res.status(200).send({
            status: "success",
            message: "Alle Server-Daten erfolgreich gespeichert",
            data: returnObject
        })
    })
        .catch(() => {
            _sendError(res, "Konnte nicht in die Datenbank schreiben", 500)
        })
})

router.post('/favourite/:action', async (req, res) => {
    if (!req.body.guild) {
        _sendError(res, "Server nicht angegeben");
        return;
    }
    const botGuild = await req.bot.guilds.fetch(req.body.guild)
    if (!botGuild) {
        _sendError(res, "Ungültiger Server angegeben");
        return;
    }

    const dbUser = await dbManager.getUser({ discordId: req.userId })

    switch (req.params.action) {
        case 'add': {
            if (!dbUser.favouriteGuilds.includes(req.body.guild)) {
                dbUser.favouriteGuilds.push(req.body.guild)
                await dbUser.save();
            }
            res.status(200).send({
                status: "success",
                message: "Server zu Favoriten hinzugefügt",
                data: req.body.guild
            })
            break;
        }
        case 'remove': {
            if (dbUser.favouriteGuilds.includes(req.body.guild)) {
                dbUser.favouriteGuilds.splice(dbUser.favouriteGuilds.indexOf(req.body.guild), 1)
                await dbUser.save();
            }
            res.status(200).send({
                status: "success",
                message: "Server von Favoriten entfernt",
                data: req.body.guild
            })
            break;
        }
        default:
            _sendError(res, 'Aktion nicht gültig')
            return
    }
})

module.exports = router;
