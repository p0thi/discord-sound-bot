export default class ServerManager {
    constructor () {
        this.managers = {};
    }

    set server (server) {
        if (!this.managers[server.id]) {
            this.managers[server.id] = server;
        }
    }

    get server (id) {
        return this.managers[id];
    }
}