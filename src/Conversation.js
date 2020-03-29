import Discord from 'discord.js';
import log from '../log.js'


const activeConversations = {};
const confirmRegex = /^(ja|j|yes|y)$/i;
const denyRegex = /^(nein|n|no|cancel|abbrechen|abbruch)$/i;
const abortRegex = /^(abbrechen|abbruch|exit|cancel)$/i;

export default class Conversation {


    constructor(triggerMessage, actionStack, ttl, successCallback, errorCallback) {
        if (activeConversations[triggerMessage.author.id]) {
            errorCallback(this);
            return;
        }
        if (!triggerMessage.channel.type === "dm") {
            errorCallback(this);
            return;
        }
        activeConversations[triggerMessage.author.id] = this;

        this.lastInteraction = new Date(); // TODO auto abort
        this.timeout = setTimeout(() => {
            triggerMessage.reply("Der Vorgang wurde wegen Inaktivität abgebrochen. :alarm_clock:");
            this.abort();
            errorCallback(this);
        }, ttl);
        this.triggerMessage = triggerMessage;
        this.actionStack = actionStack;
        this.successCallback = successCallback;
        this.errorCallback = errorCallback;
        this.ttl = ttl;
        this.confirmed = false;
    }

    // Muster actionStack item:
    // {
    //     title: "Titel",
    //     message(conv) {
    //         return "Nachricht an user -> Call to action";
    //     },
    //     result: undefined,
    //     acceptedAnswers(message) {
    //         return /ab+c/i.match(message.content.trim())
    //     },
    // }

    async trigger(message) { // true if can/should triggered. false if should be treated like a message outside of conversation
        if (message.author.id !== this.triggerMessage.author.id) {
            this.abort();
            return false;
        }
        if (!this.checkDateValid()) {
            return false;
        }

        if (abortRegex.test(message.content.trim())) {
            this.triggerMessage.reply("Okay. Der Vorgang wird **abgebrochen**.");
            this.abort();
            this.errorCallback(this);
            return;
        }

        this.lastInteraction = new Date();
        this.timeout.refresh();

        let action = this.getCurrentAction();
        if (!action) {
            if (this.confirmed) {
                this.finish();
            }
            else {
                if (confirmRegex.test(message.content.trim())) {
                    log.info("coversation confirmed")
                    this.confirmed = true;
                    this.triggerMessage.reply("Okay. Ich habe alles so gespeichert.");
                    this.sendNextCallToAction();
                    return;
                }
                else if (denyRegex.test(message.content.trim())) {
                    log.info("coversation denied")
                    this.triggerMessage.reply("Okay. Der Vorgang wurde abgebrochen.");
                    this.abort();
                    this.errorCallback(this);
                    return;
                }
                this.denyInput();
            }
            return;
        }
        let result = !!action.acceptedAnswers ? await action.acceptedAnswers(message, this) : message.content.trim();
        if (result) {
            action.result = result;
            this.acceptInput(action.result);
        }
        else {
            this.denyInput()
        }
    }

    acceptInput(input) {
        this.triggerMessage.reply("Okay. Folgende Eingabe wurde gespeichert: **" + this.resultToString(input) + "**");
        this.sendNextCallToAction();
    }

    denyInput() {
        this.triggerMessage.reply("Das verstehe ich leider nicht, oder ist keine gültige Eingabe. :face_with_monocle:");
        this.sendNextCallToAction();
    }

    async sendNextCallToAction() {
        let action = this.getCurrentAction();
        if (!action) {
            if (this.confirmed) {
                this.finish();
            }
            else {
                this.confirm();
            }
            return
        }
        let messageReturn = await action.message(this);
        if (Array.isArray(messageReturn)) {
            for (let i = 0; i < messageReturn.length; i++) {
                this.triggerMessage.reply(messageReturn[i]);
            }
        }
        else {
            this.triggerMessage.reply(messageReturn);
        }
    }

    getCurrentAction() {
        for (let item of this.actionStack) {
            if (!item.result) {
                return item;
            }
        }
    }

    confirm() {
        let finalEmbed = new Discord.MessageEmbed()
            .setTitle("Zusammenfassung")
            .setDescription("Sollen die untenstehenden Eingaben so gespeichert werden?\nMögliche Antworten: **Ja, Nein**")
            .addField('\u200b', '\u200b');

        for (var item of this.actionStack) {
            finalEmbed.addField(item.title, this.resultToString(item.result), true);
        }
        this.triggerMessage.channel.send(finalEmbed);
    }

    finish() {
        this.delete();
        this.successCallback(this);
    }

    abort() {
        clearTimeout(this.timeout);
        for (var action of this.actionStack) {
            if (action.revert) {
                action.revert(this, action);
            }
        }
        this.delete();
    }

    delete() {
        activeConversations[this.triggerMessage.author.id] = undefined;
        clearTimeout(this.timeout);
    }

    checkDateValid() {
        let valid = new Date().getTime() - this.lastInteraction.getTime() <= this.ttl;
        if (!valid) {
            this.abort();
            this.errorCallback(this);
        }
        return valid;
    }

    resultToString(result) {
        if (typeof result === 'string') {
            return result;
        }
        else if (!result) {
            return 'n.A.';
        }
        else if (result.oldFilename) {
            return result.oldFilename;
        }
        else if (result.dbFile) {
            return result.dbFile.filename;
        }
        else if (result.name) {
            return result.name;
        }
        else if (result.command) {
            return result.command
        }
        else {
            return "Datei";
        }
    }
}

Conversation.checkUserConversation = function (id) {
    let conv = activeConversations[id];
    if (!conv || !conv.checkDateValid()) {
        return undefined;
    }
    return activeConversations[id];
}