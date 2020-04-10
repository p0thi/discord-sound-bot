import express from 'express'
import path from 'path'
import bodyParser from 'body-parser'
import cors from 'cors'

import AuthManager from './managers/AuthManager'

const authManager = new AuthManager();
const app = express();

export default {
    init(bot) {

        app.listen(50451, 'localhost', () => {
            console.info('Running on port 50451');
        });

        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());

        app.options('*', cors()) // include before other routes
        app.use(cors());

        app.use((err, req, res, next) => {
            if (err) console.error(err);
            switch (err.message) {
                case "NoCodeProvided": {
                    return res.status(400).send({
                        status: "error",
                        error: err.message
                    })
                }
                default: {
                    return res.status(500).send({
                        status: "error",
                        error: err.message
                    })
                }
            }
        })

        app.use('/api/auth', require("./auth"));

        app.use((req, res, next) => {
            let token = req.headers.authorization;
            let verified = authManager.verifyToken(token)
            if (!token || !verified) {
                return res.status(401).send({
                    status: "error",
                    error: "Unauthorized"
                })
            }

            req.userId = verified.id
            req.bot = bot
            next()
        })

        app.use('/api/user', require('./user'));
        app.use('/api/guilds', require('./guilds'));
        app.use('/api/sounds', require('./sounds'));


    }
}