export default class MessageDeleter {
    constructor(delay = 20000) {
        this.delay = delay;
    }


    add(msg, delay) {
        return setTimeout(() => msg.delete().catch(error => console.error("Could not delete Message.")), delay || this.delay);
    }
}