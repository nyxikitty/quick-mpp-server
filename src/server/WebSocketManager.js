const { WebSocket } = require('ws');
const { generateClientId } = require('./utils/idGenerator');
const BinaryProtocol = require('../protocol/BinaryProtocol');

class WebSocketManager {
    constructor(server, messageHandler) {
        this.server = server;
        this.messageHandler = messageHandler;
    }

    bindEventListeners() {
        this.server.wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress || 'unknown';
            const clientId = generateClientId(ip);
            const connectionId = generateClientId();

            if (!this.server.clients.has(clientId)) {
                this.server.clients.set(clientId, {
                    connections: new Map(),
                    participant: null,
                    channelId: null,
                    userId: clientId
                });
            }

            const client = this.server.clients.get(clientId);
            client.connections.set(connectionId, ws);

            ws.on('message', (data) => {
                try {
                    // Handle binary protocol
                    if (Buffer.isBuffer(data)) {
                        const messages = BinaryProtocol.decode(data);
                        messages.forEach((msg) => this.messageHandler.handleMessage(clientId, msg));
                    } else {
                        // Fallback to JSON for backwards compatibility
                        const messages = JSON.parse(data);
                        messages.forEach((msg) => this.messageHandler.handleMessage(clientId, msg));
                    }
                } catch (err) {
                    console.error('Invalid message received:', err);
                }
            });

            ws.on('close', () => {
                client.connections.delete(connectionId);
                this.server.clientManager.handleDisconnect(clientId, connectionId);
            });

            ws.on('error', (err) => {
                console.error(`Connection ${connectionId} for client ${clientId} error:`, err);
                client.connections.delete(connectionId);
                this.server.clientManager.handleDisconnect(clientId, connectionId);
            });
        });

        this.server.wss.on('listening', () => {
            this.server.start();
        });

        this.server.wss.on('error', (err) => {
            console.error('Server error:', err);
            this.server._connectionState = 'ERROR';
            this.server.emit('status', 'Server error');
        });
    }
}

module.exports = WebSocketManager;