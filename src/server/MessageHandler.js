const WebSocket = require('ws');
const NoteQuota = require("./ratelimiters/NoteQuota");

class MessageHandler {
    constructor(server, clientManager, channelManager) {
        this.server = server;
        this.clientManager = clientManager;
        this.channelManager = channelManager;

        this.MOVE_THROTTLE_MS = 50;
    }

    handleMessage(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        const handlers = {
            hi: this.handleHi,
            bye: this.handleBye,
            '+ls': this.handlePlusLs,
            '-ls': this.handleMinusLs,
            t: this.handleTime,
            a: this.handleChat,
            n: this.handleNote,
            m: this.handleMovement,
            userset: this.handleUserset,
            kickban: this.handleKickban,
            unban: this.handleUnban,
            ch: this.channelManager.handleChannel.bind(this.channelManager),
            chset: this.channelManager.handleChannelSettings.bind(this.channelManager),
            chown: this.channelManager.handleChown.bind(this.channelManager),            
            devices: this.handleDevices
        };

        const handler = handlers[msg.m];
        if (handler) {
            handler.call(this, clientId, msg);
        } else {
            console.log(`Unknown message type from ${clientId}:`, msg);
        }
    }

    sendToClient(client, message) {
        const data = JSON.stringify(message);
        for (const ws of client.connections.values()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
    }

    broadcastToClientConnections(client, message) {
        const str = JSON.stringify(message);
        for (const ws of client.connections.values()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(str);
        }
    }

    handleHi(clientId, msg) {
        const client = this.server.clients.get(clientId);
        const participant = {
            id: clientId,
            _id: client.userId,
            name: `Anonymous`,
            color: `#${client.userId.substring(0, 6)}`,
            x: 0,
            y: 0
        };

        client.participant = participant;
        client.noteQuota = new NoteQuota();

        const response = [{
            m: 'hi',
            u: participant,
            t: Date.now(),
            v: '1.0.0',
            motd: 'Welcome to Multiplayer Piano!'
        }, {
            m: 'nq',
            params: client.noteQuota.getParams()
        }];

        this.broadcastToClientConnections(client, response);
        this.server.emit('participant joined', participant);
    }

    handleBye(clientId) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        for (const [connectionId, ws] of client.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            this.clientManager.handleDisconnect(clientId, connectionId);
        }
    }

    handlePlusLs(clientId) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        this.server.subscribedToLs.add(clientId);

        const channels = [...this.server.channels.values()]
            .filter(ch => ch.settings.visible !== false)
            .map(ch => ({
                _id: ch._id,
                count: ch.participants.size,
                crown: ch.settings.lobby ? undefined : ch.crown,
                settings: ch.settings
            }));

        const response = [{
            m: 'ls',
            c: true,
            u: channels
        }];

        this.broadcastToClientConnections(client, response);
    }

    handleMinusLs(clientId) {
        this.server.subscribedToLs.delete(clientId);
    }

    handleTime(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        const response = [{
            m: 't',
            t: Date.now(),
            e: msg.e
        }];

        this.broadcastToClientConnections(client, response);
    }

    handleChat(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !msg.message || typeof msg.message !== 'string') return;
        if (msg.message.length > 256) return;

        const channel = this.server.channels.get(client.channelId);
        if (!channel.settings.chat) return;

        const message = {
            m: 'a',
            a: msg.message.slice(0, 256),
            p: client.participant,
            t: Date.now()
        };

        this.channelManager.broadcastToChannel(client.channelId, [message]);
    }

    handleMovement(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !client.participant) return;

        const now = Date.now();
        if (client.lastMoveTime && now - client.lastMoveTime < this.MOVE_THROTTLE_MS) return;
        client.lastMoveTime = now;

        const x = parseFloat(msg.x);
        const y = parseFloat(msg.y);
        if (isNaN(x) || isNaN(y)) return;

        client.participant.x = x;
        client.participant.y = y;

        const movement = {
            m: 'm',
            id: clientId,
            x,
            y
        };

        this.channelManager.broadcastToChannel(client.channelId, [movement], clientId);
    }

    handleUserset(clientId, msg) {
        const client = this.server.clients.get(clientId);
        const set = msg.set;
        if (!client.participant || !set || typeof set.name !== 'string') return;

        const trimmedName = set.name.trim();
        if (!trimmedName || trimmedName.length > 40) return;

        client.participant.name = trimmedName;

        const update = {
            m: 'p',
            id: clientId,
            _id: client.userId,
            name: trimmedName,
            color: set.color || client.participant.color,
            x: client.participant.x,
            y: client.participant.y
        };

        this.channelManager.broadcastToChannel(client.channelId, [update]);
    }

    handleKickban(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !msg._id || typeof msg._id !== 'string' || typeof msg.ms !== 'number') return;

        const channel = this.server.channels.get(client.channelId);
        if (channel.crown.participantId !== clientId || channel.settings.lobby) return;

        const targetClient = [...this.server.clients.values()].find(
            c => c.userId === msg._id && c.channelId === client.channelId
        );
        if (!targetClient) return;

        const duration = Math.min(msg.ms, 24 * 60 * 60 * 1000);
        const expiry = Date.now() + duration;
        this.server.bannedUsers.set(msg._id, { channelId: client.channelId, expiry });

        this.channelManager.handleChannel(msg._id, { _id: 'test/awkward' });

        const banMessage = [{
            m: 'notification',
            id: `ban-${Date.now()}`,
            title: '',
            text: `You have been banned from ${channel._id} for ${duration / 1000} seconds.`,
            class: 'short',
            duration: 5000
        }];

        this.broadcastToClientConnections(targetClient, banMessage);

        const text = msg._id === client.userId
            ? `Let it be known that ${client.participant.name} kickbanned him/her self.`
            : `${client.participant.name} banned ${targetClient.participant.name} for ${duration / 1000} seconds.`;

        const broadcast = [{
            m: 'notification',
            id: `ban-${Date.now()}`,
            title: '',
            text,
            class: 'short',
            duration: 5000
        }];

        this.channelManager.broadcastToChannel(client.channelId, broadcast);
    }

    handleNote(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !msg.n || !Array.isArray(msg.n)) return;
    
        const needed = msg.n.length;
        if (!client.noteQuota || !client.noteQuota.spend(needed)) {
            this.broadcastToClientConnections(client, [{
                m: "notification",
                text: "You're playing too fast! Slow down.",
                class: "short",
                duration: 2000
            }]);
            return;
        }
    
        const channel = this.server.channels.get(client.channelId);
        if (channel.settings.crownsolo && channel.crown && channel.crown.participantId !== clientId) return;
    
        const noteMsg = {
            m: 'n',
            t: msg.t,
            n: msg.n,
            p: clientId
        };
    
        this.channelManager.broadcastToChannel(client.channelId, [noteMsg], clientId);
    }
    
    handleUnban(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !msg._id) return;

        const channel = this.server.channels.get(client.channelId);
        if (channel.crown.participantId !== clientId || channel.settings.lobby) return;

        this.server.bannedUsers.delete(msg._id);

        const notice = [{
            m: 'notification',
            id: `unban-${Date.now()}`,
            title: '',
            text: `Unbanned user ${msg._id}`,
            class: 'short',
            duration: 5000
        }];

        this.channelManager.broadcastToChannel(client.channelId, notice);
    }

    handleDevices(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        console.log(`Devices from ${clientId}:`, msg.list);

        const response = [{
            m: 'devices',
            status: 'received',
            list: msg.list
        }];

        this.broadcastToClientConnections(client, response);
    }

    setUpNoteQuotaLoop() {
        setInterval(() => {
            for (const client of this.server.clients.values()) {
                if (client.noteQuota) {
                    client.noteQuota.tick();
                }
            }
        }, 1000);
    }
}

module.exports = MessageHandler;
