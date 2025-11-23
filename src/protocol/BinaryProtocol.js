const { Buffer } = require('buffer');

/**
 * Custom Binary Protocol for MPP Server
 *
 * Message Format:
 * - Opcode (1 byte): Message type identifier
 * - Payload length (3 bytes): Length of the payload (max 16MB)
 * - Payload (variable): Message-specific data
 */

class BinaryProtocol {
    static OPCODES = {
        // Client -> Server
        HI: 0x01,
        BYE: 0x02,
        PLUS_LS: 0x03,
        MINUS_LS: 0x04,
        TIME: 0x05,
        CHAT: 0x06,
        NOTE: 0x07,
        MOVEMENT: 0x08,
        USERSET: 0x09,
        KICKBAN: 0x0A,
        UNBAN: 0x0B,
        CHANNEL: 0x0C,
        CHSET: 0x0D,
        CHOWN: 0x0E,
        DEVICES: 0x0F,

        // Server -> Client
        LS: 0x10,
        PARTICIPANT: 0x11,
        NOTE_QUOTA: 0x12,
        NOTIFICATION: 0x13,
        CH_INFO: 0x14
    };

    static MESSAGE_MAP = {
        'hi': 'HI',
        'bye': 'BYE',
        '+ls': 'PLUS_LS',
        '-ls': 'MINUS_LS',
        't': 'TIME',
        'a': 'CHAT',
        'n': 'NOTE',
        'm': 'MOVEMENT',
        'userset': 'USERSET',
        'kickban': 'KICKBAN',
        'unban': 'UNBAN',
        'ch': 'CHANNEL',
        'chset': 'CHSET',
        'chown': 'CHOWN',
        'devices': 'DEVICES',
        'ls': 'LS',
        'p': 'PARTICIPANT',
        'nq': 'NOTE_QUOTA',
        'notification': 'NOTIFICATION'
    };

    /**
     * Encode a message to binary format
     * @param {Object} msg - Message object with 'm' property indicating type
     * @returns {Buffer} Encoded binary message
     */
    static encode(msg) {
        const opcodeName = this.MESSAGE_MAP[msg.m];
        if (!opcodeName) {
            throw new Error(`Unknown message type: ${msg.m}`);
        }

        const opcode = this.OPCODES[opcodeName];
        const payload = this.encodePayload(msg);

        const header = Buffer.allocUnsafe(4);
        header.writeUInt8(opcode, 0);
        header.writeUIntBE(payload.length, 1, 3);

        return Buffer.concat([header, payload]);
    }

    /**
     * Encode multiple messages into a single buffer
     * @param {Array} messages - Array of message objects
     * @returns {Buffer} Encoded binary messages
     */
    static encodeMultiple(messages) {
        const buffers = messages.map(msg => this.encode(msg));
        return Buffer.concat(buffers);
    }

    /**
     * Decode binary data to message objects
     * @param {Buffer} buffer - Binary data
     * @returns {Array} Array of decoded message objects
     */
    static decode(buffer) {
        const messages = [];
        let offset = 0;

        while (offset < buffer.length) {
            if (buffer.length - offset < 4) {
                throw new Error('Incomplete message header');
            }

            const opcode = buffer.readUInt8(offset);
            const payloadLength = buffer.readUIntBE(offset + 1, 3);
            offset += 4;

            if (buffer.length - offset < payloadLength) {
                throw new Error('Incomplete message payload');
            }

            const payload = buffer.slice(offset, offset + payloadLength);
            offset += payloadLength;

            const msg = this.decodeMessage(opcode, payload);
            messages.push(msg);
        }

        return messages;
    }

    /**
     * Encode payload based on message type
     */
    static encodePayload(msg) {
        const parts = [];

        switch (msg.m) {
            case 'hi':
                if (msg.u) parts.push(this.encodeParticipant(msg.u));
                if (msg.t !== undefined) parts.push(this.encodeNumber(msg.t));
                if (msg.v) parts.push(this.encodeString(msg.v));
                if (msg.motd) parts.push(this.encodeString(msg.motd));
                break;

            case 'bye':
                // No payload
                break;

            case 't':
                parts.push(this.encodeNumber(msg.t));
                if (msg.e !== undefined) parts.push(this.encodeNumber(msg.e));
                break;

            case 'a':
                parts.push(this.encodeString(msg.a));
                if (msg.p) parts.push(this.encodeParticipant(msg.p));
                parts.push(this.encodeNumber(msg.t));
                break;

            case 'n':
                if (msg.t !== undefined) parts.push(this.encodeNumber(msg.t));
                parts.push(this.encodeArray(msg.n, this.encodeNote.bind(this)));
                if (msg.p) parts.push(this.encodeString(msg.p));
                break;

            case 'm':
                parts.push(this.encodeString(msg.id));
                parts.push(this.encodeNumber(msg.x));
                parts.push(this.encodeNumber(msg.y));
                break;

            case 'userset':
                if (msg.set) {
                    parts.push(this.encodeString(msg.set.name || ''));
                    parts.push(this.encodeString(msg.set.color || ''));
                }
                break;

            case 'p':
                parts.push(this.encodeParticipant(msg));
                break;

            case 'ch':
                parts.push(this.encodeString(msg._id || ''));
                if (msg.ch) parts.push(this.encodeChannel(msg.ch));
                if (msg.p) parts.push(this.encodeArray(msg.p, this.encodeParticipant.bind(this)));
                if (msg.ppl !== undefined) parts.push(this.encodeNumber(msg.ppl));
                break;

            case 'ls':
                parts.push(this.encodeBoolean(msg.c || false));
                if (msg.u) parts.push(this.encodeArray(msg.u, this.encodeChannelInfo.bind(this)));
                break;

            case 'nq':
                parts.push(this.encodeNoteQuota(msg.params));
                break;

            case 'notification':
                if (msg.id) parts.push(this.encodeString(msg.id));
                if (msg.title !== undefined) parts.push(this.encodeString(msg.title));
                parts.push(this.encodeString(msg.text || ''));
                if (msg.class) parts.push(this.encodeString(msg.class));
                if (msg.duration !== undefined) parts.push(this.encodeNumber(msg.duration));
                break;

            case 'kickban':
                parts.push(this.encodeString(msg._id));
                parts.push(this.encodeNumber(msg.ms));
                break;

            case 'unban':
                parts.push(this.encodeString(msg._id));
                break;

            case 'chset':
                if (msg.set) parts.push(this.encodeChannelSettings(msg.set));
                break;

            case 'chown':
                if (msg.id !== undefined) parts.push(this.encodeString(msg.id));
                break;

            case 'devices':
                if (msg.list) parts.push(this.encodeArray(msg.list, this.encodeString.bind(this)));
                if (msg.status) parts.push(this.encodeString(msg.status));
                break;

            default:
                throw new Error(`Encoding not implemented for message type: ${msg.m}`);
        }

        return Buffer.concat(parts);
    }

    /**
     * Decode message from opcode and payload
     */
    static decodeMessage(opcode, payload) {
        const opcodeName = Object.keys(this.OPCODES).find(key => this.OPCODES[key] === opcode);
        if (!opcodeName) {
            throw new Error(`Unknown opcode: 0x${opcode.toString(16)}`);
        }

        const msgType = Object.keys(this.MESSAGE_MAP).find(key => this.MESSAGE_MAP[key] === opcodeName);
        let offset = 0;
        const msg = { m: msgType };

        const readString = () => {
            const result = this.decodeString(payload.slice(offset));
            offset += result.bytesRead;
            return result.value;
        };

        const readNumber = () => {
            const result = this.decodeNumber(payload.slice(offset));
            offset += result.bytesRead;
            return result.value;
        };

        const readBoolean = () => {
            const result = this.decodeBoolean(payload.slice(offset));
            offset += result.bytesRead;
            return result.value;
        };

        switch (msgType) {
            case 'hi':
                // Client 'hi' has no payload
                break;

            case 't':
                if (offset < payload.length) msg.e = readNumber();
                break;

            case 'a':
                if (offset < payload.length) msg.message = readString();
                break;

            case 'n':
                if (offset < payload.length) {
                    msg.t = readNumber();
                    const notesResult = this.decodeArray(payload.slice(offset), this.decodeNote.bind(this));
                    msg.n = notesResult.value;
                    offset += notesResult.bytesRead;
                }
                break;

            case 'm':
                if (offset < payload.length) {
                    msg.x = readNumber();
                    msg.y = readNumber();
                }
                break;

            case 'userset':
                if (offset < payload.length) {
                    const name = readString();
                    const color = offset < payload.length ? readString() : '';
                    msg.set = { name, color };
                }
                break;

            case 'ch':
                if (offset < payload.length) msg._id = readString();
                if (offset < payload.length) {
                    const setResult = this.decodeChannelSettings(payload.slice(offset));
                    msg.set = setResult.value;
                    offset += setResult.bytesRead;
                }
                break;

            case 'kickban':
                msg._id = readString();
                msg.ms = readNumber();
                break;

            case 'unban':
                msg._id = readString();
                break;

            case 'chown':
                if (offset < payload.length) msg.id = readString();
                break;

            case 'chset':
                if (offset < payload.length) {
                    const setResult = this.decodeChannelSettings(payload.slice(offset));
                    msg.set = setResult.value;
                    offset += setResult.bytesRead;
                }
                break;

            case 'devices':
                if (offset < payload.length) {
                    const listResult = this.decodeArray(payload.slice(offset), this.decodeString.bind(this));
                    msg.list = listResult.value;
                    offset += listResult.bytesRead;
                }
                break;
        }

        return msg;
    }

    // Primitive encoders
    static encodeString(str) {
        const buf = Buffer.from(str, 'utf8');
        const header = Buffer.allocUnsafe(2);
        header.writeUInt16BE(buf.length, 0);
        return Buffer.concat([header, buf]);
    }

    static encodeNumber(num) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeDoubleBE(num, 0);
        return buf;
    }

    static encodeBoolean(bool) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(bool ? 1 : 0, 0);
        return buf;
    }

    static encodeArray(arr, encodeItem) {
        const header = Buffer.allocUnsafe(2);
        header.writeUInt16BE(arr.length, 0);
        const items = arr.map(item => encodeItem(item));
        return Buffer.concat([header, ...items]);
    }

    // Primitive decoders
    static decodeString(buf) {
        if (buf.length < 2) throw new Error('Buffer too small for string');
        const length = buf.readUInt16BE(0);
        if (buf.length < 2 + length) throw new Error('Buffer too small for string data');
        const value = buf.slice(2, 2 + length).toString('utf8');
        return { value, bytesRead: 2 + length };
    }

    static decodeNumber(buf) {
        if (buf.length < 8) throw new Error('Buffer too small for number');
        const value = buf.readDoubleBE(0);
        return { value, bytesRead: 8 };
    }

    static decodeBoolean(buf) {
        if (buf.length < 1) throw new Error('Buffer too small for boolean');
        const value = buf.readUInt8(0) !== 0;
        return { value, bytesRead: 1 };
    }

    static decodeArray(buf, decodeItem) {
        if (buf.length < 2) throw new Error('Buffer too small for array');
        const count = buf.readUInt16BE(0);
        const arr = [];
        let offset = 2;

        for (let i = 0; i < count; i++) {
            const result = decodeItem(buf.slice(offset));
            arr.push(result.value);
            offset += result.bytesRead;
        }

        return { value: arr, bytesRead: offset };
    }

    // Complex type encoders
    static encodeParticipant(p) {
        return Buffer.concat([
            this.encodeString(p.id || p._id || ''),
            this.encodeString(p._id || ''),
            this.encodeString(p.name || ''),
            this.encodeString(p.color || ''),
            this.encodeNumber(p.x || 0),
            this.encodeNumber(p.y || 0)
        ]);
    }

    static encodeNote(note) {
        return Buffer.concat([
            this.encodeString(note.n),
            note.v !== undefined ? this.encodeNumber(note.v) : this.encodeNumber(1),
            note.d !== undefined ? this.encodeNumber(note.d) : this.encodeNumber(0),
            note.s !== undefined ? this.encodeNumber(note.s) : this.encodeNumber(1)
        ]);
    }

    static encodeChannel(ch) {
        return Buffer.concat([
            this.encodeString(ch._id),
            this.encodeChannelSettings(ch.settings || {})
        ]);
    }

    static encodeChannelInfo(ch) {
        const parts = [
            this.encodeString(ch._id),
            this.encodeNumber(ch.count || 0)
        ];

        if (ch.settings) parts.push(this.encodeChannelSettings(ch.settings));
        if (ch.crown) {
            parts.push(this.encodeBoolean(true));
            parts.push(this.encodeString(ch.crown.participantId || ''));
            parts.push(this.encodeNumber(ch.crown.time || 0));
        } else {
            parts.push(this.encodeBoolean(false));
        }

        return Buffer.concat(parts);
    }

    static encodeChannelSettings(settings) {
        return Buffer.concat([
            this.encodeBoolean(settings.chat !== false),
            this.encodeBoolean(settings.crownsolo === true),
            this.encodeBoolean(settings.visible !== false),
            this.encodeString(settings.color || ''),
            this.encodeBoolean(settings.lobby === true)
        ]);
    }

    static encodeNoteQuota(params) {
        return Buffer.concat([
            this.encodeNumber(params.m || 0),
            this.encodeNumber(params.a || 0),
            this.encodeNumber(params.allowance || 0)
        ]);
    }

    // Complex type decoders
    static decodeNote(buf) {
        let offset = 0;
        const nResult = this.decodeString(buf.slice(offset));
        offset += nResult.bytesRead;

        const vResult = this.decodeNumber(buf.slice(offset));
        offset += vResult.bytesRead;

        const dResult = this.decodeNumber(buf.slice(offset));
        offset += dResult.bytesRead;

        const sResult = this.decodeNumber(buf.slice(offset));
        offset += sResult.bytesRead;

        return {
            value: {
                n: nResult.value,
                v: vResult.value,
                d: dResult.value,
                s: sResult.value
            },
            bytesRead: offset
        };
    }

    static decodeChannelSettings(buf) {
        let offset = 0;

        const chatResult = this.decodeBoolean(buf.slice(offset));
        offset += chatResult.bytesRead;

        const crownsoloResult = this.decodeBoolean(buf.slice(offset));
        offset += crownsoloResult.bytesRead;

        const visibleResult = this.decodeBoolean(buf.slice(offset));
        offset += visibleResult.bytesRead;

        const colorResult = this.decodeString(buf.slice(offset));
        offset += colorResult.bytesRead;

        const lobbyResult = this.decodeBoolean(buf.slice(offset));
        offset += lobbyResult.bytesRead;

        return {
            value: {
                chat: chatResult.value,
                crownsolo: crownsoloResult.value,
                visible: visibleResult.value,
                color: colorResult.value,
                lobby: lobbyResult.value
            },
            bytesRead: offset
        };
    }
}

module.exports = BinaryProtocol;
