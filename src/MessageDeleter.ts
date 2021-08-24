import { Message } from "discord.js";
import logger from "./log";

export default class MessageDeleter {
  private static _instance: MessageDeleter;
  delay: number;

  private constructor(delay: number = 20000) {
    this.delay = delay;
  }

  static getInstance() {
    if (!MessageDeleter._instance) {
      MessageDeleter._instance = new MessageDeleter();
    }
    return MessageDeleter._instance;
  }

  add(msg: Message, delay?: number) {
    return setTimeout(
      () =>
        msg.delete().catch((error) => logger.warn("Could not delete Message.")),
      delay || this.delay
    );
  }
}
