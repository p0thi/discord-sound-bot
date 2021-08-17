import { Message } from "discord.js";

export default class MessageDeleter {
  delay: number;
  constructor(delay: number = 20000) {
    this.delay = delay;
  }

  add(msg: Message, delay?: number) {
    return setTimeout(
      () =>
        msg
          .delete()
          .catch((error) => console.error("Could not delete Message.")),
      delay || this.delay
    );
  }
}
