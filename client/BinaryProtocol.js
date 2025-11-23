/**
 * Custom Binary Protocol for MPP Client
 * Browser-compatible version
 */

(function(exports) {
    'use strict';

    var BinaryProtocol = {
        OPCODES: {
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
        },

        MESSAGE_MAP: {
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
            'notification': 'NOTIFICATION',
            'c': 'CH_INFO'
        },

        encode: function(msg) {
            var opcodeName = this.MESSAGE_MAP[msg.m];
            if (!opcodeName) {
                throw new Error('Unknown message type: ' + msg.m);
            }

            var opcode = this.OPCODES[opcodeName];
            var payload = this.encodePayload(msg);

            var buffer = new ArrayBuffer(4 + payload.byteLength);
            var view = new DataView(buffer);
            view.setUint8(0, opcode);
            // Write 3-byte length (24 bits) in big-endian format
            view.setUint8(1, (payload.byteLength >> 16) & 0xFF);
            view.setUint8(2, (payload.byteLength >> 8) & 0xFF);
            view.setUint8(3, payload.byteLength & 0xFF);

            var result = new Uint8Array(buffer);
            result.set(new Uint8Array(payload), 4);

            return result.buffer;
        },

        encodeMultiple: function(messages) {
            var buffers = [];
            for (var i = 0; i < messages.length; i++) {
                buffers.push(this.encode(messages[i]));
            }

            var totalLength = 0;
            for (var i = 0; i < buffers.length; i++) {
                totalLength += buffers[i].byteLength;
            }

            var result = new Uint8Array(totalLength);
            var offset = 0;
            for (var i = 0; i < buffers.length; i++) {
                result.set(new Uint8Array(buffers[i]), offset);
                offset += buffers[i].byteLength;
            }

            return result.buffer;
        },

        decode: function(buffer) {
            var messages = [];
            var offset = 0;
            var view = new DataView(buffer);

            while (offset < buffer.byteLength) {
                if (buffer.byteLength - offset < 4) {
                    throw new Error('Incomplete message header');
                }

                var opcode = view.getUint8(offset);
                // Read 3-byte length (24 bits) in big-endian format
                var payloadLength = (view.getUint8(offset + 1) << 16) |
                                   (view.getUint8(offset + 2) << 8) |
                                   view.getUint8(offset + 3);
                offset += 4;

                if (buffer.byteLength - offset < payloadLength) {
                    throw new Error('Incomplete message payload');
                }

                var payload = buffer.slice(offset, offset + payloadLength);
                offset += payloadLength;

                var msg = this.decodeMessage(opcode, payload);
                messages.push(msg);
            }

            return messages;
        },

        encodePayload: function(msg) {
            var parts = [];

            switch (msg.m) {
                case 'hi':
                    if (msg['🐈'] !== undefined) parts.push(this.encodeNumber(msg['🐈']));
                    break;

                case 't':
                    if (msg.e !== undefined) parts.push(this.encodeNumber(msg.e));
                    break;

                case 'a':
                    parts.push(this.encodeString(msg.message || ''));
                    break;

                case 'n':
                    if (msg.t !== undefined) parts.push(this.encodeNumber(msg.t));
                    parts.push(this.encodeArray(msg.n, this.encodeNote.bind(this)));
                    break;

                case 'm':
                    parts.push(this.encodeNumber(msg.x));
                    parts.push(this.encodeNumber(msg.y));
                    break;

                case 'userset':
                    if (msg.set) {
                        parts.push(this.encodeString(msg.set.name || ''));
                        parts.push(this.encodeString(msg.set.color || ''));
                    }
                    break;

                case 'ch':
                    parts.push(this.encodeString(msg._id || ''));
                    if (msg.set) parts.push(this.encodeChannelSettings(msg.set));
                    break;

                case 'kickban':
                    parts.push(this.encodeString(msg._id));
                    parts.push(this.encodeNumber(msg.ms));
                    break;

                case 'unban':
                    parts.push(this.encodeString(msg._id));
                    break;

                case 'chown':
                    if (msg.id !== undefined) parts.push(this.encodeString(msg.id));
                    break;

                case 'chset':
                    if (msg.set) parts.push(this.encodeChannelSettings(msg.set));
                    break;

                case 'devices':
                    if (msg.list) parts.push(this.encodeArray(msg.list, this.encodeString.bind(this)));
                    break;

                case 'bye':
                case '+ls':
                case '-ls':
                    // No payload
                    break;

                default:
                    console.warn('Encoding not implemented for message type: ' + msg.m);
            }

            return this.concatArrayBuffers(parts);
        },

        decodeMessage: function(opcode, payload) {
            var opcodeName = null;
            for (var key in this.OPCODES) {
                if (this.OPCODES[key] === opcode) {
                    opcodeName = key;
                    break;
                }
            }

            if (!opcodeName) {
                throw new Error('Unknown opcode: 0x' + opcode.toString(16));
            }

            var msgType = null;
            for (var key in this.MESSAGE_MAP) {
                if (this.MESSAGE_MAP[key] === opcodeName) {
                    msgType = key;
                    break;
                }
            }

            var offset = 0;
            var msg = { m: msgType };
            var view = new DataView(payload);

            var self = this;
            var readString = function() {
                var result = self.decodeString(payload.slice(offset));
                offset += result.bytesRead;
                return result.value;
            };

            var readNumber = function() {
                var result = self.decodeNumber(payload.slice(offset));
                offset += result.bytesRead;
                return result.value;
            };

            var readBoolean = function() {
                var result = self.decodeBoolean(payload.slice(offset));
                offset += result.bytesRead;
                return result.value;
            };

            switch (msgType) {
                case 'hi':
                    if (offset < payload.byteLength) {
                        msg.u = this.decodeParticipant(payload.slice(offset)).value;
                        offset += this.decodeParticipant(payload.slice(offset)).bytesRead;
                    }
                    if (offset < payload.byteLength) msg.t = readNumber();
                    if (offset < payload.byteLength) msg.v = readString();
                    if (offset < payload.byteLength) msg.motd = readString();
                    break;

                case 't':
                    msg.t = readNumber();
                    if (offset < payload.byteLength) msg.e = readNumber();
                    break;

                case 'a':
                    msg.a = readString();
                    if (offset < payload.byteLength) {
                        var pResult = this.decodeParticipant(payload.slice(offset));
                        msg.p = pResult.value;
                        offset += pResult.bytesRead;
                    }
                    if (offset < payload.byteLength) msg.t = readNumber();
                    break;

                case 'n':
                    if (offset < payload.byteLength) msg.t = readNumber();
                    if (offset < payload.byteLength) {
                        var notesResult = this.decodeArray(payload.slice(offset), this.decodeNote.bind(this));
                        msg.n = notesResult.value;
                        offset += notesResult.bytesRead;
                    }
                    if (offset < payload.byteLength) msg.p = readString();
                    break;

                case 'm':
                    msg.id = readString();
                    msg.x = readNumber();
                    msg.y = readNumber();
                    break;

                case 'p':
                    var pResult = this.decodeParticipant(payload.slice(offset));
                    Object.assign(msg, pResult.value);
                    break;

                case 'ch':
                    msg._id = readString();
                    if (offset < payload.byteLength) {
                        var chResult = this.decodeChannel(payload.slice(offset));
                        msg.ch = chResult.value;
                        offset += chResult.bytesRead;
                    }
                    if (offset < payload.byteLength) {
                        var pplResult = this.decodeArray(payload.slice(offset), this.decodeParticipant.bind(this));
                        msg.ppl = pplResult.value;
                        offset += pplResult.bytesRead;
                    }
                    if (offset < payload.byteLength) msg.ppl = readNumber();
                    break;

                case 'ls':
                    msg.c = readBoolean();
                    if (offset < payload.byteLength) {
                        var channelsResult = this.decodeArray(payload.slice(offset), this.decodeChannelInfo.bind(this));
                        msg.u = channelsResult.value;
                        offset += channelsResult.bytesRead;
                    }
                    break;

                case 'nq':
                    var nqResult = this.decodeNoteQuota(payload.slice(offset));
                    msg.params = nqResult.value;
                    break;

                case 'notification':
                    if (offset < payload.byteLength) msg.id = readString();
                    if (offset < payload.byteLength) msg.title = readString();
                    if (offset < payload.byteLength) msg.text = readString();
                    if (offset < payload.byteLength) msg.class = readString();
                    if (offset < payload.byteLength) msg.duration = readNumber();
                    break;
            }

            return msg;
        },

        // Primitive encoders
        encodeString: function(str) {
            var encoder = new TextEncoder();
            var bytes = encoder.encode(str);
            var buffer = new ArrayBuffer(2 + bytes.length);
            var view = new DataView(buffer);
            view.setUint16(0, bytes.length, false);
            var result = new Uint8Array(buffer);
            result.set(bytes, 2);
            return buffer;
        },

        encodeNumber: function(num) {
            var buffer = new ArrayBuffer(8);
            var view = new DataView(buffer);
            view.setFloat64(0, num, false);
            return buffer;
        },

        encodeBoolean: function(bool) {
            var buffer = new ArrayBuffer(1);
            var view = new DataView(buffer);
            view.setUint8(0, bool ? 1 : 0);
            return buffer;
        },

        encodeArray: function(arr, encodeItem) {
            var items = [];
            for (var i = 0; i < arr.length; i++) {
                items.push(encodeItem(arr[i]));
            }

            var buffer = new ArrayBuffer(2);
            var view = new DataView(buffer);
            view.setUint16(0, arr.length, false);

            items.unshift(buffer);
            return this.concatArrayBuffers(items);
        },

        // Primitive decoders
        decodeString: function(buffer) {
            var view = new DataView(buffer);
            if (buffer.byteLength < 2) throw new Error('Buffer too small for string');
            var length = view.getUint16(0, false);
            if (buffer.byteLength < 2 + length) throw new Error('Buffer too small for string data');
            var decoder = new TextDecoder();
            var value = decoder.decode(buffer.slice(2, 2 + length));
            return { value: value, bytesRead: 2 + length };
        },

        decodeNumber: function(buffer) {
            if (buffer.byteLength < 8) throw new Error('Buffer too small for number');
            var view = new DataView(buffer);
            var value = view.getFloat64(0, false);
            return { value: value, bytesRead: 8 };
        },

        decodeBoolean: function(buffer) {
            if (buffer.byteLength < 1) throw new Error('Buffer too small for boolean');
            var view = new DataView(buffer);
            var value = view.getUint8(0) !== 0;
            return { value: value, bytesRead: 1 };
        },

        decodeArray: function(buffer, decodeItem) {
            var view = new DataView(buffer);
            if (buffer.byteLength < 2) throw new Error('Buffer too small for array');
            var count = view.getUint16(0, false);
            var arr = [];
            var offset = 2;

            for (var i = 0; i < count; i++) {
                var result = decodeItem(buffer.slice(offset));
                arr.push(result.value);
                offset += result.bytesRead;
            }

            return { value: arr, bytesRead: offset };
        },

        // Complex type encoders
        encodeParticipant: function(p) {
            return this.concatArrayBuffers([
                this.encodeString(p.id || p._id || ''),
                this.encodeString(p._id || ''),
                this.encodeString(p.name || ''),
                this.encodeString(p.color || ''),
                this.encodeNumber(p.x || 0),
                this.encodeNumber(p.y || 0)
            ]);
        },

        encodeNote: function(note) {
            return this.concatArrayBuffers([
                this.encodeString(note.n),
                this.encodeNumber(note.v !== undefined ? note.v : 1),
                this.encodeNumber(note.d !== undefined ? note.d : 0),
                this.encodeNumber(note.s !== undefined ? note.s : 1)
            ]);
        },

        encodeChannelSettings: function(settings) {
            return this.concatArrayBuffers([
                this.encodeBoolean(settings.chat !== false),
                this.encodeBoolean(settings.crownsolo === true),
                this.encodeBoolean(settings.visible !== false),
                this.encodeString(settings.color || ''),
                this.encodeBoolean(settings.lobby === true)
            ]);
        },

        // Complex type decoders
        decodeParticipant: function(buffer) {
            var offset = 0;
            var idResult = this.decodeString(buffer.slice(offset));
            offset += idResult.bytesRead;

            var _idResult = this.decodeString(buffer.slice(offset));
            offset += _idResult.bytesRead;

            var nameResult = this.decodeString(buffer.slice(offset));
            offset += nameResult.bytesRead;

            var colorResult = this.decodeString(buffer.slice(offset));
            offset += colorResult.bytesRead;

            var xResult = this.decodeNumber(buffer.slice(offset));
            offset += xResult.bytesRead;

            var yResult = this.decodeNumber(buffer.slice(offset));
            offset += yResult.bytesRead;

            return {
                value: {
                    id: idResult.value,
                    _id: _idResult.value,
                    name: nameResult.value,
                    color: colorResult.value,
                    x: xResult.value,
                    y: yResult.value
                },
                bytesRead: offset
            };
        },

        decodeNote: function(buffer) {
            var offset = 0;
            var nResult = this.decodeString(buffer.slice(offset));
            offset += nResult.bytesRead;

            var vResult = this.decodeNumber(buffer.slice(offset));
            offset += vResult.bytesRead;

            var dResult = this.decodeNumber(buffer.slice(offset));
            offset += dResult.bytesRead;

            var sResult = this.decodeNumber(buffer.slice(offset));
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
        },

        decodeChannel: function(buffer) {
            var offset = 0;
            var _idResult = this.decodeString(buffer.slice(offset));
            offset += _idResult.bytesRead;

            var settingsResult = this.decodeChannelSettings(buffer.slice(offset));
            offset += settingsResult.bytesRead;

            return {
                value: {
                    _id: _idResult.value,
                    settings: settingsResult.value
                },
                bytesRead: offset
            };
        },

        decodeChannelInfo: function(buffer) {
            var offset = 0;
            var _idResult = this.decodeString(buffer.slice(offset));
            offset += _idResult.bytesRead;

            var countResult = this.decodeNumber(buffer.slice(offset));
            offset += countResult.bytesRead;

            var settingsResult = this.decodeChannelSettings(buffer.slice(offset));
            offset += settingsResult.bytesRead;

            var hasCrown = this.decodeBoolean(buffer.slice(offset));
            offset += hasCrown.bytesRead;

            var crown = null;
            if (hasCrown.value) {
                var participantIdResult = this.decodeString(buffer.slice(offset));
                offset += participantIdResult.bytesRead;

                var timeResult = this.decodeNumber(buffer.slice(offset));
                offset += timeResult.bytesRead;

                crown = {
                    participantId: participantIdResult.value,
                    time: timeResult.value
                };
            }

            return {
                value: {
                    _id: _idResult.value,
                    count: countResult.value,
                    settings: settingsResult.value,
                    crown: crown
                },
                bytesRead: offset
            };
        },

        decodeChannelSettings: function(buffer) {
            var offset = 0;

            var chatResult = this.decodeBoolean(buffer.slice(offset));
            offset += chatResult.bytesRead;

            var crownsoloResult = this.decodeBoolean(buffer.slice(offset));
            offset += crownsoloResult.bytesRead;

            var visibleResult = this.decodeBoolean(buffer.slice(offset));
            offset += visibleResult.bytesRead;

            var colorResult = this.decodeString(buffer.slice(offset));
            offset += colorResult.bytesRead;

            var lobbyResult = this.decodeBoolean(buffer.slice(offset));
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
        },

        decodeNoteQuota: function(buffer) {
            var offset = 0;

            var mResult = this.decodeNumber(buffer.slice(offset));
            offset += mResult.bytesRead;

            var aResult = this.decodeNumber(buffer.slice(offset));
            offset += aResult.bytesRead;

            var allowanceResult = this.decodeNumber(buffer.slice(offset));
            offset += allowanceResult.bytesRead;

            return {
                value: {
                    m: mResult.value,
                    a: aResult.value,
                    allowance: allowanceResult.value
                },
                bytesRead: offset
            };
        },

        // Utility
        concatArrayBuffers: function(buffers) {
            var totalLength = 0;
            for (var i = 0; i < buffers.length; i++) {
                totalLength += buffers[i].byteLength;
            }

            var result = new Uint8Array(totalLength);
            var offset = 0;
            for (var i = 0; i < buffers.length; i++) {
                result.set(new Uint8Array(buffers[i]), offset);
                offset += buffers[i].byteLength;
            }

            return result.buffer;
        }
    };

    // Export for both Node.js and browser
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BinaryProtocol;
    } else {
        exports.BinaryProtocol = BinaryProtocol;
    }

})(typeof exports === 'undefined' ? this : exports);
