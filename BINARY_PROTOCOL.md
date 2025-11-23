# Binary Protocol Documentation

This server now uses a custom binary protocol for WebSocket communication, providing more efficient data transfer compared to JSON.

## Protocol Overview

The binary protocol encodes messages in a compact binary format with a fixed header and variable-length payload.

### Message Format

Each message consists of:
- **Header (4 bytes)**:
  - Byte 0: Opcode (message type identifier)
  - Bytes 1-3: Payload length (24-bit unsigned integer, big-endian, max ~16MB)
- **Payload (variable)**: Message-specific binary data

### Opcodes

| Opcode | Message Type | Direction | Description |
|--------|--------------|-----------|-------------|
| 0x01   | hi           | Bidirectional | Client handshake / Server welcome |
| 0x02   | bye          | C→S | Client disconnect |
| 0x03   | +ls          | C→S | Subscribe to channel list |
| 0x04   | -ls          | C→S | Unsubscribe from channel list |
| 0x05   | t            | Bidirectional | Time synchronization |
| 0x06   | a            | Bidirectional | Chat message |
| 0x07   | n            | Bidirectional | Note (piano key) event |
| 0x08   | m            | Bidirectional | Cursor movement |
| 0x09   | userset      | C→S | Update user settings |
| 0x0A   | kickban      | C→S | Kick/ban user |
| 0x0B   | unban        | C→S | Unban user |
| 0x0C   | ch           | Bidirectional | Channel join/info |
| 0x0D   | chset        | C→S | Update channel settings |
| 0x0E   | chown        | C→S | Transfer channel ownership |
| 0x0F   | devices      | Bidirectional | MIDI device list |
| 0x10   | ls           | S→C | Channel list response |
| 0x11   | p            | S→C | Participant update |
| 0x12   | nq           | S→C | Note quota update |
| 0x13   | notification | S→C | Server notification |
| 0x14   | CH_INFO      | S→C | Channel information |

## Data Types

The protocol uses the following primitive data types:

### String
- **Format**: Length prefix (2 bytes, big-endian) + UTF-8 bytes
- **Max length**: 65,535 bytes

### Number
- **Format**: IEEE 754 double-precision float (8 bytes, big-endian)

### Boolean
- **Format**: 1 byte (0 = false, 1 = true)

### Array
- **Format**: Count (2 bytes, big-endian) + items
- **Max items**: 65,535

## Complex Types

### Participant
```
- id: String
- _id: String
- name: String
- color: String
- x: Number
- y: Number
```

### Note
```
- n: String (note name, e.g., "a4")
- v: Number (velocity, 0-1)
- d: Number (delay in ms)
- s: Number (stop flag, 1 = release)
```

### Channel Settings
```
- chat: Boolean
- crownsolo: Boolean
- visible: Boolean
- color: String
- lobby: Boolean
```

### Note Quota
```
- m: Number (max notes)
- a: Number (allowance)
- allowance: Number (current allowance)
```

## Backwards Compatibility

The server maintains backwards compatibility with JSON messages:
- If the server receives text data, it parses it as JSON
- If the server receives binary data, it decodes it using the binary protocol
- The client similarly handles both binary and JSON responses

## Benefits

1. **Efficiency**: Binary encoding is typically 30-50% smaller than JSON
2. **Performance**: Faster parsing and serialization
3. **Type Safety**: Explicit data types reduce errors
4. **Bandwidth**: Reduced network traffic, especially for real-time note events

## Implementation Files

- **Server**: `/src/protocol/BinaryProtocol.js`
- **Client**: `/client/BinaryProtocol.js`
- **WebSocket Handler**: `/src/server/WebSocketManager.js`
- **Message Handler**: `/src/server/MessageHandler.js`

## Example Usage

### Server-Side (Node.js)
```javascript
const BinaryProtocol = require('./src/protocol/BinaryProtocol');

// Encode a message
const buffer = BinaryProtocol.encode({
    m: 'a',
    a: 'Hello, world!',
    p: participant,
    t: Date.now()
});

// Decode a message
const messages = BinaryProtocol.decode(receivedBuffer);
```

### Client-Side (Browser)
```javascript
// Encode multiple messages
const buffer = BinaryProtocol.encodeMultiple([
    { m: 'hi' },
    { m: 't', e: Date.now() }
]);

ws.send(buffer);

// Decode received messages
ws.onmessage = function(evt) {
    if (evt.data instanceof ArrayBuffer) {
        const messages = BinaryProtocol.decode(evt.data);
        messages.forEach(msg => handleMessage(msg));
    }
};
```

## Testing

To verify the binary protocol is working:
1. Start the server: `node index.js`
2. Open the web client in a browser
3. Check the browser console - binary messages should be sent/received
4. Monitor network traffic to see reduced payload sizes

## Future Enhancements

- Message compression (gzip/deflate)
- Protocol versioning
- Additional opcodes for new features
- Streaming support for large payloads
