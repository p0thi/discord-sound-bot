import Discord, { Guild, Message, MessageEmbed } from "discord.js";
import { MongooseGridFSFileModel } from "mongoose-gridfs";
import IGuild from "./db/interfaces/IGuild.js";
import ISound from "./db/interfaces/ISound.js";
import log from "./log.js";
import { ISoundResultData } from "./MessageHandler.js";

const activeConversations = {};
const confirmRegex = /^(ja|j|yes|y)$/i;
const denyRegex = /^(nein|n|no|cancel|abbrechen|abbruch)$/i;
const abortRegex = /^(abbrechen|abbruch|exit|cancel)$/i;

export default class Conversation {
  lastInteraction: Date;
  timeout: NodeJS.Timeout;
  triggerMessage: Message;
  actionStack: Action<ActionResultType>[];
  successCallback: (result: any) => void;
  errorCallback: (result: any) => void;
  ttl: number;
  confirmed: boolean;

  constructor(
    triggerMessage: Message,
    actionStack: Action<ActionResultType>[],
    ttl: number,
    successCallback: (result: any) => void,
    errorCallback: (result: any) => void
  ) {
    if (activeConversations[triggerMessage.author.id]) {
      errorCallback(this);
      return;
    }
    if (!(triggerMessage.channel.type === "dm")) {
      errorCallback(this);
      return;
    }
    activeConversations[triggerMessage.author.id] = this;

    this.lastInteraction = new Date(); // TODO auto abort
    this.timeout = setTimeout(() => {
      triggerMessage.reply(
        "The process was canceled due to inactivity. :alarm_clock:"
      );
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

  async trigger(message) {
    // true if can/should triggered. false if should be treated like a message outside of conversation
    if (message.author.id !== this.triggerMessage.author.id) {
      this.abort();
      return false;
    }
    if (!this.checkDateValid()) {
      return false;
    }

    if (abortRegex.test(message.content.trim())) {
      this.triggerMessage.reply("OK. The process is **canceled**.");
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
      } else {
        if (confirmRegex.test(message.content.trim())) {
          log.info("coversation confirmed");
          this.confirmed = true;
          this.triggerMessage.reply("OK. I saved everything like this.");
          this.sendNextCallToAction();
          return;
        } else if (denyRegex.test(message.content.trim())) {
          log.info("coversation denied");
          this.triggerMessage.reply("OK. The process was canceled.");
          this.abort();
          this.errorCallback(this);
          return;
        }
        this.denyInput();
      }
      return;
    }
    let result = !!action.acceptedAnswers
      ? await action.acceptedAnswers(message, this)
      : message.content.trim();
    if (result) {
      action.result = result;
      this.acceptInput(action.result);
    } else {
      this.denyInput();
    }
  }

  acceptInput(input) {
    this.triggerMessage.reply(
      "OK. The following inputs have been saved: **" +
        this.resultToString(input) +
        "**"
    );
    this.sendNextCallToAction();
  }

  denyInput() {
    this.triggerMessage.reply(
      "Unfortunately, I do not understand this, or it is not a valid input. :face_with_monocle:"
    );
    this.sendNextCallToAction();
  }

  async sendNextCallToAction() {
    let action = this.getCurrentAction();
    if (!action) {
      if (this.confirmed) {
        this.finish();
      } else {
        this.confirm();
      }
      return;
    }
    let messageReturn = await action.message(this);
    if (Array.isArray(messageReturn)) {
      for (let i = 0; i < messageReturn.length; i++) {
        this.triggerMessage.reply(messageReturn[i]);
      }
    } else {
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
      .setTitle("Conclusion")
      .setDescription(
        "Should the information below be saved?\nPossible answers: **Yes, No**"
      )
      .addField("\u200b", "\u200b");

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
    let valid =
      new Date().getTime() - this.lastInteraction.getTime() <= this.ttl;
    if (!valid) {
      this.abort();
      this.errorCallback(this);
    }
    return valid;
  }

  resultToString(result) {
    if (typeof result === "string") {
      return result;
    } else if (!result) {
      return "n.A.";
    } else if (result.oldFilename) {
      return result.oldFilename;
    } else if (result.dbFile) {
      return result.dbFile.filename;
    } else if (result.name) {
      return result.name;
    } else if (result.command) {
      return result.command;
    } else {
      return "File";
    }
  }

  static checkUserConversation(id) {
    let conv = activeConversations[id];
    if (!conv || !conv.checkDateValid()) {
      return undefined;
    }
    return activeConversations[id];
  }
}

export type ActionResultType =
  | string
  // | false
  | Guild
  | IGuild
  | ISoundResultData
  | ISound;

export interface Action<R extends ActionResultType> {
  title: string;
  message(conv: Conversation): Promise<string | string[] | MessageEmbed[]>;

  result?: R;
  dbFile?: MongooseGridFSFileModel;
  acceptedAnswers(message: Message, conv?: Conversation): Promise<R>;
  revert?: (conv: Conversation, action: Action<R>) => void;
}
