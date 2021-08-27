import express from "express";
import path from "path";
import btoa from "btoa";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import moment from "moment";
import AuthManager from "./managers/AuthManager";
import log from "../log";
import DatabaseManager from "../managers/DatabaseManager";
// import html from "./callback.html";

const dbManager = DatabaseManager.getInstance();
const authManager = new AuthManager();
const router = express.Router();

const callbackHtml =
  '<!DOCTYPE html><script>window.onload=function (){const urlParams=new URLSearchParams(window.location.search); if (window.opener){let code=urlParams.get("code"); window.opener.postMessage({code, source: "callback"}, "*"); window.close();}};</script>';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;

router.post("/login", (req, res) => {
  // console.log("body", req.body)
  const code = req.body.code;
  const redirect = encodeURIComponent(`${req.body.redirect}`);
  const creds = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const url = `https://discord.com/api/oauth2/token`;
  const body = new URLSearchParams(
    `grant_type=authorization_code&code=${code}&redirect_uri=${redirect}`
  );
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
    },
    body,
  }).then((response) => {
    response.json().then((json) => {
      log.debug(json);
      log.debug(url);
      if (json.error) {
        res.status(500).send({
          status: "error",
          message: json.error_description,
        });
        return;
      }

      let scopes = json.scope.split(" ");
      if (!(scopes.includes("identify") && scopes.includes("guilds"))) {
        res
          .status(400)
          .send({ status: "error", error: `Wrong scopes: ${json.scopes}` });
      }

      fetch("https://discord.com/api/users/@me", {
        method: "GET",
        headers: { Authorization: `Bearer ${json.access_token}` },
      }).then(async (resp) => {
        let userData = await resp.json();
        let dbUser = await dbManager.getUser({ discordId: userData.id });
        await authManager.setUserCredentials(dbUser, json);

        let token = jwt.sign({ id: userData.id }, process.env.JWT_TOKEN, {
          expiresIn: "7d",
        });
        res.status(200).json({ token, user: userData });
      });
    });
  });
});

router.get("/client_id", (req, res) => {
  res.status(200).json({
    client_id: process.env.CLIENT_ID,
    redirect_url: `${process.env.BASE_URL}/api/auth/callback`,
  });
});

router.get("/callback", (req, res) => {
  res.status(200).send(callbackHtml); //.sendFile(path.join(__dirname, "callback.html"));
});

module.exports = router;
