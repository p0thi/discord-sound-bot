import express from 'express'
import fetch from 'node-fetch'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord')

const router = express.Router()

router.get('/self', (req, res) => {
    const user = req.bot.users.cache.get(req.userId);
    res.status(200).send({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        displayAvatarURL: user.displayAvatarURL({ format: 'png', dynamic: true })
    })
})

module.exports = router;