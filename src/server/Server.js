const EventEmitter = require('events').EventEmitter;
const MessageHandler = require('./MessageHandler');
const ChannelManager = require('./ChannelManager');
const ClientManager = require('./ClientManager');
const WebSocketManager = require('./WebSocketManager');

class Server extends EventEmitter {
    constructor(wss) {
        super();
        this.wss = wss;
        this.channels = new Map();
        this.clients = new Map();
        this.subscribedToLs = new Set();
        this.bannedUsers = new Map();
        this._connectionState = 'Offline';

        this.clientManager = new ClientManager(this);
        this.channelManager = new ChannelManager(this);
        this.messageHandler = new MessageHandler(this, this.clientManager, this.channelManager);
        this.webSocketManager = new WebSocketManager(this, this.messageHandler);

        this.webSocketManager.bindEventListeners();
        this.messageHandler.setUpNoteQuotaLoop();
    }

    start() {
        this._connectionState = 'Online';
        this.emit('status', 'Server running');
    }
}

module.exports = Server;