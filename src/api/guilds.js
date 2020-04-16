import express from 'express'
import fetch from 'node-fetch'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'
import { _sendError } from './utils'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord')

const router = express.Router()

router.get("/all", async (req, res) => {
    dbManager.getUser({ discordId: req.userId }).then(user => {
        authManager.getDiscordToken(user).then(token => {
            console.log(token)
            fetch('https://discordapp.com/api//users/@me/guilds', {
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
                        guild.icon = botGuild.iconURL()
                        guild.name = botGuild.name
                        guild.owner = botGuild.ownerID === req.userId
                    })

                    res.status(200).send(intersectingGuilds);
                }).catch(e => console.error(e))

            }).catch(e => console.error(e))
        })
    })
})

router.post('/favourite/:action', async (req, res) => {
    if (!req.body.guild) {
        _sendError(res, "Server nicht angegeben");
        return;
    }
    const botGuild = req.bot.guilds.cache.get(req.body.guild)
    if (!botGuild) {
        _sendError(res, "Ungültiger Server angegeben");
        return;
    }

    const dbUser = await dbManager.getUser({ discordId: req.userId})

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
