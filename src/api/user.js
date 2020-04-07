import express from 'express'
import fetch from 'node-fetch'
import DatabaseManager from '../DatabaseManager'
import AuthManager from './managers/AuthManager'

const authManager = new AuthManager();
const dbManager = new DatabaseManager('discord')

const router = express.Router()