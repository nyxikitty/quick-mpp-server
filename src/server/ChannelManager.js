const BinaryProtocol = require("../protocol/BinaryProtocol");
const WebSocket = require('ws');

class ChannelManager {
    constructor(server) {
        this.server = server;
    }

    handleChannel(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client || !msg._id || typeof msg._id !== 'string') return;

        const channelId = msg._id.length <= 512 ? msg._id : 'lobby';
        const isSpecial = channelId === 'lobby' || channelId.startsWith('test/');

        if (!client.participant) {
            client.participant = {
                id: clientId,
                _id: client.userId || clientId,
                name: 'Anonymous',
                color: `#${(client.userId || clientId).substring(0, 6)}`,
                x: 0,
                y: 0
            };
        }

        const ban = this.server.bannedUsers.get(client.userId || clientId);
        if (ban && ban.channelId === channelId && ban.expiry > Date.now()) {
            const banMessage = BinaryProtocol.encodeMultiple([{
                m: 'notification',
                id: `Notification-ban-${Date.now()}`,
                title: '',
                text: `You are banned from ${channelId} until ${new Date(ban.expiry).toISOString()}.`,
                class: 'short',
                duration: 5000
            }]);
            for (const [_, ws] of client.connections) {
                ws.send(banMessage);
            }
            return;
        }

        let channel = this.server.channels.get(channelId);
        if (!channel) {
            const defaultSettings = {
                color: '#ecfaed',
                lobby: isSpecial,
                visible: true
            };

            const customSettings = (msg.set && typeof msg.set === 'object') ? {
                ...msg.set,
                lobby: isSpecial,
                visible: isSpecial || msg.set.visible !== false
            } : defaultSettings;

            channel = {
                _id: channelId,
                settings: customSettings,
                crown: isSpecial ? undefined : {
                    participantId: null,
                    userId: null,
                    time: Date.now(),
                    startPos: { x: 0, y: 0 },
                    endPos: { x: 0, y: 0 }
                },
                participants: new Map(),
                chatHistory: []
            };

            if (isSpecial) {
                channel.settings.visible = true;
                channel.settings.lobby = true;
                channel.settings.color = "#73b3cc";
                channel.settings.color2 = "#273546";
                channel.settings.chat = true;
            }

            this.server.channels.set(channelId, channel);
            this.broadcastLsUpdate(channelId, false);
        } else if (msg.set && typeof msg.set === 'object' && (!channel.crown || channel.crown.participantId === clientId)) {
            Object.assign(channel.settings, msg.set);

            if (isSpecial) {
                channel.settings.visible = true;
                channel.settings.lobby = true;
                channel.settings.color = "#73b3cc";
                channel.settings.color2 = "#273546";
                channel.settings.chat = true;
            }

            this.broadcastLsUpdate(channelId, false);
        }

        if (client.channelId && client.channelId !== channelId) {
            const oldChannel = this.server.channels.get(client.channelId);
            if (oldChannel) {
                oldChannel.participants.delete(clientId);
                this.broadcastToChannel(client.channelId, [{ m: 'bye', p: clientId }]);

                if (oldChannel.crown && oldChannel.crown.participantId === clientId) {
                    oldChannel.crown.participantId = null;
                    oldChannel.crown.userId = null;
                }

                const oldIsSpecial = oldChannel._id === 'lobby' || oldChannel._id.startsWith('test/');
                if (!oldIsSpecial && oldChannel.participants.size === 0) {
                    this.server.channels.delete(client.channelId);
                    this.broadcastLsUpdate(client.channelId, false);
                }
            }
        }

        client.channelId = channelId;
        channel.participants.set(clientId, client.participant);

        if (channel.crown && !channel.crown.participantId) {
            channel.crown.participantId = clientId;
            channel.crown.userId = client.userId || clientId;
            channel.crown.time = Date.now();
        }

        const ppl = Array.from(channel.participants.values());

        const channelData = BinaryProtocol.encodeMultiple([
            {
                m: 'ch',
                ch: {
                    _id: channelId,
                    settings: channel.settings,
                    crown: channel.crown
                },
                ppl,
                p: clientId
            },
            {
                m: 'c',
                c: channel.chatHistory
            }
        ]);

        for (const [_, ws] of client.connections) {
            ws.send(channelData);
        }

        this.broadcastToChannel(channelId, [{
            m: 'p',
            id: clientId,
            _id: client.userId || clientId,
            name: client.participant.name,
            color: client.participant.color,
            x: client.participant.x,
            y: client.participant.y
        }], clientId);

        this.broadcastLsUpdate(channelId, false);
    }

    handleChannelSettings(clientId, msg) {
        const client = this.server.clients.get(clientId);
        if (!client.channelId || !msg.set || typeof msg.set !== 'object') return;

        const channel = this.server.channels.get(client.channelId);
        if (!channel || (channel.crown && channel.crown.participantId !== clientId)) return;

        if (channel._id.startsWith("lobby") || channel._id.startsWith('test/')) {
            channel.settings.visible = true;
            channel.settings.lobby = true;
            channel.settings.color = "#73b3cc";
            channel.settings.color = "#273546";
            channel.settings.chat = true;
            return;
        }
        
        Object.assign(channel.settings, msg.set);

        this.broadcastToChannel(client.channelId, [{
            m: 'ch',
            ch: {
                _id: channel._id,
                settings: channel.settings,
                crown: channel.crown
            },
            ppl: Array.from(channel.participants.values())
        }]);

        this.broadcastLsUpdate(channel._id, false);
    }

    handleChown(clientId, msg) {
        const targetId = msg.id;
        const client = this.server.clients.get(clientId);
        if (!client.channelId) return;

        const channel = this.server.channels.get(client.channelId);
        if (!channel || channel.settings.lobby || !channel.crown || channel.crown.participantId !== clientId) return;

        if (!targetId) {
            channel.crown = {
                participantId: null,
                userId: client.userId,
                time: Date.now(),
                startPos: { x: client.participant.x, y: client.participant.y },
                endPos: { x: client.participant.x, y: client.participant.y }
            };
        } else {
            const target = this.server.clients.get(targetId);
            if (!target) return;

            channel.crown = {
                participantId: targetId,
                userId: target.userId,
                time: Date.now(),
                startPos: { x: client.participant.x, y: client.participant.y },
                endPos: { x: target.participant.x, y: target.participant.y }
            };
        }

        this.broadcastToChannel(client.channelId, [{
            m: 'ch',
            ch: {
                _id: channel._id,
                settings: channel.settings,
                crown: channel.crown
            },
            ppl: Array.from(channel.participants.values())
        }]);
    }

    broadcastToChannel(channelId, messages, excludeClientId = null) {
        const channel = this.server.channels.get(channelId);
        if (!channel) return;

        for (const msg of messages) {
            if (msg.m === 'a' && msg.a) {
                channel.chatHistory.push(msg);
                if (channel.chatHistory.length > 32) channel.chatHistory.shift();
            }
        }

        const data = BinaryProtocol.encodeMultiple(messages);

        for (const [clientId, client] of this.server.clients) {
            if (client.channelId === channelId && clientId !== excludeClientId) {
                for (const [_, ws] of client.connections) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    }
                }
            }
        }
    }

    broadcastLsUpdate(channelId, isBulk) {
        const channel = this.server.channels.get(channelId);
        if (!channel || channel.settings.visible === false) return;

        const message = {
            m: 'ls',
            c: isBulk,
            u: [{
                _id: channel._id,
                count: channel.participants.size,
                crown: channel.settings.lobby ? undefined : channel.crown,
                settings: channel.settings
            }]
        };

        const data = BinaryProtocol.encodeMultiple([message]);

        for (const clientId of this.server.subscribedToLs) {
            const client = this.server.clients.get(clientId);
            if (client && client.connections) {
                for (const [_, ws] of client.connections) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    }
                }
            }
        }
    }
}

module.exports = ChannelManager;
