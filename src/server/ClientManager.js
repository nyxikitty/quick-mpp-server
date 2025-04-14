class ClientManager {
    constructor(server) {
        this.server = server;
    }

    handleDisconnect(clientId, connectionId) {
        const client = this.server.clients.get(clientId);
        if (!client) return;

        client.connections.delete(connectionId);

        if (client.connections.size > 0) return;

        if (client.channelId) {
            const channel = this.server.channels.get(client.channelId);
            if (channel) {
                channel.participants.delete(clientId);
                this.server.channelManager.broadcastToChannel(client.channelId, [{
                    m: 'bye',
                    p: clientId
                }]);
                if (channel.crown && channel.crown.participantId === clientId) {
                    channel.crown.participantId = null;
                    channel.crown.userId = null;
                    const remaining = Array.from(channel.participants.keys());
                    if (remaining.length > 0) {
                        channel.crown.participantId = remaining[0];
                        channel.crown.userId = this.server.clients.get(remaining[0]).userId;
                        channel.crown.time = Date.now();
                    }
                }
                if (channel.participants.size === 0 && channel._id !== 'lobby' && !channel._id.startsWith('test/')) {
                    this.server.channels.delete(client.channelId);
                    this.server.channelManager.broadcastLsUpdate(client.channelId, false);
                }
            }
        }

        this.server.subscribedToLs.delete(clientId);
        this.server.clients.delete(clientId);
        this.server.emit('participant left', client.participant);
    }
}

module.exports = ClientManager;