import Discord, {
  AwaitMessagesOptions,
  DMChannel,
  EmbedField,
  Guild,
  InteractionCollector,
  Message,
  MessageActionRow,
  MessageAttachment,
  MessageButton,
  MessageComponentInteraction,
  MessageEmbed,
  MessageOptions,
  MessagePayload,
  MessageSelectMenu,
  SelectMenuInteraction,
  TextBasedChannels,
  TextChannel,
} from "discord.js";
import ISound from "./db/interfaces/ISound.js";
import { v1 as uuid } from "uuid";
import { create } from "domain";
import DatabaseManager from "./DatabaseManager.js";
import log from "./log";
import logger from "./log";

const confirmRegex = /^(ja|j|yes|y)$/i;
const denyRegex = /^(nein|n|no|cancel|abbrechen|abbruch)$/i;
const abortRegex = /^(abbrechen|abbruch|exit|cancel)$/i;

const dbManager = DatabaseManager.getInstance();

export default class Conversation {
  static activeConversations: Map<string, Conversation> = new Map();
  name: string;
  lastInteraction: Date;
  timeout: NodeJS.Timeout;
  triggerMessage: Message;
  actionStack: Action[];
  onSuccess: (result: any) => void;
  onError: (result: any) => void;
  ttl: number;
  confirmed: boolean;
  sentMessages: Message[] = [];
  uid = uuid();

  private _messageComponentInteractions: MessageComponentInteraction[] = [];
  private _buttonCollector: InteractionCollector<MessageComponentInteraction>;
  private _deleted = false;

  public get deleted() {
    return this._deleted;
  }

  constructor() {}

  static createConversation(
    name: string,
    triggerMessage: Message,
    ttl: number,
    onSuccess: (conv: Conversation) => void,
    onError: (conv: Conversation) => void
  ): Conversation | undefined {
    if (Conversation.activeConversations.has(triggerMessage.author.id)) {
      const conversation = Conversation.activeConversations.get(
        triggerMessage.author.id
      );
      onError(conversation);
      return;
    }

    if (triggerMessage.channel.type !== "DM") {
      onError(undefined);
      return;
    }

    const conv = new Conversation();

    conv.lastInteraction = new Date(); // TODO auto abort
    conv.name = name;
    conv.timeout = setTimeout(() => {
      triggerMessage.channel.send(
        "The process was canceled due to inactivity. :alarm_clock:"
      );
      conv.abort();
      onError(conv);
    }, ttl);
    conv.triggerMessage = triggerMessage;
    conv.onSuccess = onSuccess;
    conv.onError = onError;
    conv.ttl = ttl;
    conv.actionStack = [];
    conv.confirmed = false;
    conv._buttonCollector =
      triggerMessage.channel.createMessageComponentCollector({
        filter: (i) => i.customId === `conversation-abort#${conv.uid}`,
        max: 1,
      });
    conv._buttonCollector.on("collect", (component) => {
      component.deferUpdate();
      conv.abort();
    });
    return conv;
  }

  addActions(actions: Action[]) {
    this.actionStack = actions;
    this.actionStack.push(
      new Action<string>({
        title: "Conclusion",
        conv: this,
        interactionType: QuestionInteractionType.BUTTON,
        message: async (conv) => {
          const embed = {
            title: `Conclusion for interaction: **${this.name}**`,
            author: this.triggerMessage.client.user.username,
            description:
              "Should I save the inputs you made?\nHere is an overview:",
            color: "#00d111",
            fields: conv.actionStack
              .filter((a) => !!a.options.result)
              .map((action) => ({
                name: action.options.title,
                inline: true,
                value: action.options.resultToString(
                  conv,
                  action.options.result
                ),
              })),
          };

          const row = new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId(`confirm#${conv.uid}`)
              .setLabel("YES")
              .setStyle("PRIMARY"),
            new MessageButton()
              .setCustomId(`conversation-abort#${conv.uid}`)
              .setLabel("Abort")
              .setStyle("DANGER"),
          ]);

          return { embeds: [embed], components: [row] } as MessageOptions;
        },
        resultToString: (conv, response) => response,
        idToResult: async (conv, id) => id,
        verifyResponse: async (conv, result) => {
          log.info(result);
          if (result.startsWith("conversation-abort")) {
            conv.abort();
            return;
          }
          return true;
        },
        isConclusion: true,
      })
    );
  }

  start(): void {
    this.sendNextCallToAction();
  }

  addMessageComponentInteraction(interaction: MessageComponentInteraction) {
    this._messageComponentInteractions.push(interaction);
  }

  getNextActionWithoutResult(): Action {
    for (let item of this.actionStack) {
      if (item.options.result === undefined) {
        return item;
      }
    }
    return undefined;
  }

  async finish(): Promise<void> {
    this.delete();
    await this.onSuccess(this);
    this.triggerMessage.channel.send("Interaction complete :white_check_mark:");
  }

  actionResultChanged() {
    this.timeout.refresh();
    this.sendNextCallToAction();
  }

  async sendNextCallToAction() {
    if (this.actionStack.length === 0) {
      this.abort();
      return;
    }
    let action = this.getCurrentAction();
    if (!action) {
      if (!this._deleted) this.finish();
      return;
    }

    action.sendMessage();
  }

  getCurrentAction() {
    for (let item of this.actionStack) {
      if (!item.options.result) {
        return item;
      }
    }
  }

  public abort(): void {
    if (this._deleted) return;
    clearTimeout(this.timeout);
    if (this.actionStack) {
      for (var action of this.actionStack) {
        if (action.options.revert) {
          action.options.revert(this, action.options.result);
        }
      }
    }

    this.delete();
    this.sentMessages.forEach((msg) => {
      msg.edit({ components: [] }).catch(() => {
        log.warn("could not remove components from dm message");
      });
    });
    this.triggerMessage.channel.send(
      "The current interaction **has been aborted**. Please start a new one. :octagonal_sign:"
    );
  }

  delete(): void {
    Conversation.activeConversations.delete(this.triggerMessage.author.id);
    clearTimeout(this.timeout);
    this._buttonCollector?.stop();
    this._deleted = true;
  }

  checkDateValid() {
    let valid =
      new Date().getTime() - this.lastInteraction.getTime() <= this.ttl;
    if (!valid) {
      this.abort();
      this.onError(this);
    }
    return valid;
  }

  static checkUserConversation(id) {
    if (!Conversation.activeConversations.has(id)) {
      return undefined;
    }
    let conv = Conversation.activeConversations.get(id);
    if (!conv || !conv.checkDateValid()) {
      return undefined;
    }
    return conv;
  }
}

export class ActionOptions<T extends ActionResponseType = ActionResponseType> {
  title: string;
  conv: Conversation;
  message: (conv: Conversation) => Promise<MessageOptions>;
  revert?: (conv: Conversation, result: T) => void;
  verifyResponse?: (conv: Conversation, response: T) => Promise<true | string>;
  resultToString: (conv: Conversation, result: T) => string;
  idToResult?: (conv: Conversation, id: string) => Promise<T>;
  result?: T = undefined;
  interactionType: QuestionInteractionType;
  isConclusion?: boolean = false;

  constructor(init: Partial<ActionOptions<T>>) {
    Object.assign(this, init);
  }
}

export class Action<T extends ActionResponseType = ActionResponseType> {
  options: ActionOptions<T>;

  constructor(options: ActionOptions<T>) {
    this.options = options;
  }

  async sendMessage(): Promise<void> {
    this.options.conv.sentMessages.forEach((m) => {
      m.edit({ components: [] }).catch((e) =>
        log.warn("Could not remove components from conversation message")
      );
    });
    if (this.options.conv.deleted) {
      return;
    }
    const content = await this.options.message(this.options.conv);

    if (!content.components || content.components?.length === 0) {
      content.components = [];
    }

    const abortButtonRow = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`conversation-abort#${this.options.conv.uid}`)
        .setLabel("Abort")
        .setStyle("SECONDARY"),
    ]);
    if (!this.options.isConclusion && content.components.length <= 5) {
      content.components.push(abortButtonRow);
    }

    const question = await this.options.conv.triggerMessage.channel
      .send(content)
      .catch((e) => {
        log.error("could not send message: " + this.options.title, e);
      });
    if (
      this.options.interactionType === QuestionInteractionType.BUTTON ||
      this.options.interactionType === QuestionInteractionType.SELECT
    ) {
      if (!this.options.isConclusion && content.components.length === 1) {
        this.options.conv.abort();
        return;
      }
    }

    if (!question) {
      this.options.conv.triggerMessage.channel.send(
        "An error occured. Aborting..."
      );
      this.options.conv.abort();
      return;
    }
    this.options.conv.sentMessages.push(question);

    const actionResponse = new ActionResponse(
      this.options.interactionType,
      question,
      this.options.conv
    );
    const returnVal = await actionResponse.getResponse();

    let val =
      this.options.idToResult && typeof returnVal === "string"
        ? await this.options.idToResult(this.options.conv, returnVal)
        : returnVal;
    const setResult = await this.setResult(val as T);
    if (setResult) {
      question.react("✅");
    }
  }

  async setResult(result: T): Promise<T | void> {
    if (this.options.conv.deleted) {
      return;
    }

    if (this.options.verifyResponse) {
      const verification = await this.options.verifyResponse(
        this.options.conv,
        result
      );
      if (verification !== true) {
        if (!this.options.conv.deleted) {
          this.options.conv.triggerMessage.channel.send(
            "The input is not valid. **" + verification + "**"
          );
          this.options.conv.sendNextCallToAction();
        }
        return;
      }
    }

    if (!result) {
      this.options.conv.triggerMessage.channel.send(
        "I could not handle this input. Please try again"
      );

      await this.sendMessage();
      return;
    }

    this.options.result = result;
    this.options.conv.actionResultChanged();
    return result;
  }
}

export type ActionResponseType = string | MessageAttachment | Guild | ISound;

class ActionResponse<T extends ActionResponseType = ActionResponseType> {
  type: QuestionInteractionType;
  question: Message;
  conv: Conversation;

  constructor(
    type: QuestionInteractionType,
    question: Message,
    conv: Conversation
  ) {
    this.type = type;
    this.question = question;
    this.conv = conv;
  }

  async getResponse(): Promise<string | MessageAttachment> {
    if (this.type === QuestionInteractionType.FILE) {
      const messages = await this.question.channel.awaitMessages({
        filter: (m) =>
          m.author.id !== this.question.author.id &&
          !this.conv.deleted &&
          m.attachments.size === 1,
        max: 1,
        time: 700000,
      } as AwaitMessagesOptions);

      if (!messages || messages.size === 0) {
        this.conv.abort();
        return;
      }

      this.conv.triggerMessage.channel.sendTyping();

      const file = messages.first().attachments.first();

      return file;
    } else if (this.type === QuestionInteractionType.MESSAGE) {
      const messages = await this.question.channel.awaitMessages({
        filter: (m) =>
          m.author.id !== this.question.author.id && !this.conv.deleted,
        max: 1,
        time: 700000,
      } as AwaitMessagesOptions);

      if (!messages || messages.size === 0) {
        this.conv.abort();
        return;
      }
      this.conv.triggerMessage.channel.sendTyping();

      const content = messages.first().content;

      return content;
    } else if (this.type === QuestionInteractionType.BUTTON) {
      log.debug("Button interaction not implemented yet");
      const interaction = await this.question.awaitMessageComponent({
        componentType: "BUTTON",
        time: 700000,
      });

      if (!interaction) {
        this.conv.abort();
        return;
      }

      this.conv.addMessageComponentInteraction(interaction);

      const content = (interaction.component as MessageButton).customId.split(
        "#"
      )[0];
      interaction.deferUpdate();

      return content;
    } else if (this.type === QuestionInteractionType.SELECT) {
      const interaction = await this.question.awaitMessageComponent({
        componentType: "SELECT_MENU",
        time: 700000,
      });

      if (!interaction) {
        this.conv.abort();
        return;
      }

      this.conv.addMessageComponentInteraction(interaction);

      const content =
        (interaction as SelectMenuInteraction).values.length === 1
          ? (interaction as SelectMenuInteraction).values[0]
          : (interaction as SelectMenuInteraction).values.join("#");
      interaction.deferUpdate();

      return content;
    }
  }
}

export enum QuestionInteractionType {
  FILE,
  MESSAGE,
  BUTTON,
  SELECT,
}
