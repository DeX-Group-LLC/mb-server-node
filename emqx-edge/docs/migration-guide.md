# Migration Guide: mb-server-node → MQTT 5.0

This guide walks you through migrating from the custom `mb-server-node` protocol to native MQTT 5.0.

---

## Migration Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MIGRATION PATH                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   mb-server-node (Custom)              EMQX Edge (MQTT 5.0)             │
│   ───────────────────────              ─────────────────────            │
│                                                                         │
│   Custom WebSocket/TCP         ───►    Standard MQTT protocol           │
│   Custom headers               ───►    MQTT 5.0 properties              │
│   Built-in registry            ───►    Retained messages + LWT          │
│   Custom client library        ───►    Any MQTT client (Paho, mqtt.js)  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Protocol Changes

### Message Format

```
  BEFORE (mb-server-node)                 AFTER (MQTT 5.0)
  ───────────────────────                 ────────────────

  publish:baggage/arrival:1.0.0           Topic: baggage/arrival
  {"baggageId": "ABC"}                    Payload: {"baggageId": "ABC"}
                                          Props: userProperties.version = "1.0.0"

  request:sac/lookup:1.0.0:req-1::5000    Topic: request/sac/lookup
  {"id": "123"}                           Payload: {"id": "123"}
                                          Props:
                                            responseTopic = response/{clientId}/req-1
                                            correlationData = req-1
                                            messageExpiryInterval = 5
                                            userProperties.version = "1.0.0"
```

### Header → Property Mapping

| Old Header | New Property | Example |
|:-----------|:-------------|:--------|
| `action` | Packet type | `PUBLISH`, `SUBSCRIBE` |
| `topic` | Topic name | `events/baggage/arrival` |
| `version` | `userProperties` | `{ version: '1.0.0' }` |
| `requestId` | `correlationData` | `Buffer.from('req-123')` |
| `timeout` | `messageExpiryInterval` | `30` (seconds) |

---

## Phase 2: Client Library

### Before
```javascript
// Custom client
const { MBClient } = require('mb-server-node');
const client = new MBClient('ws://localhost:3000');
```

### After
```javascript
// Standard MQTT client
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883', {
    protocolVersion: 5,  // ← CRITICAL: Must be 5
    clientId: 'my-service-01',
    username: 'service',
    password: 'service123'
});
```

---

## Phase 3: Request-Response

### Before
```javascript
// Built-in request method
const response = await client.request('sac/lookup', { id: '123' });
```

### After
```javascript
// Manual request-response pattern
const requestId = 'req-' + Date.now();
const responseTopic = `response/${clientId}/${requestId}`;

// 1. Subscribe to response inbox (do once at startup)
client.subscribe(`response/${clientId}/#`);

// 2. Send request
client.publish('request/sac/lookup', JSON.stringify({ id: '123' }), {
    properties: {
        responseTopic: responseTopic,
        correlationData: Buffer.from(requestId),
        userProperties: { version: '1.0.0' }
    }
});

// 3. Handle response in message handler
client.on('message', (topic, payload, packet) => {
    const corrId = packet.properties?.correlationData?.toString();
    if (corrId === requestId) {
        const response = JSON.parse(payload);
        // Process response...
    }
});
```

---

## Phase 4: Service Registration

### Before
```javascript
client.registerService({
    name: 'BaggageHandler',
    version: '1.0.0',
    capabilities: ['process', 'track']
});
```

### After
```javascript
// Connect with Last Will (automatic offline on crash)
const client = mqtt.connect('mqtt://localhost:1883', {
    protocolVersion: 5,
    clientId: 'baggage-handler-01',
    will: {
        topic: 'services/baggage-handler-01/status',
        payload: JSON.stringify({ status: 'offline' }),
        retain: true,
        properties: { userProperties: { version: '1.0.0' } }
    }
});

client.on('connect', () => {
    // Publish capabilities (retained for discovery)
    client.publish('services/baggage-handler-01/capabilities', JSON.stringify({
        name: 'BaggageHandler',
        capabilities: ['process', 'track'],
        version: '1.0.0'
    }), { retain: true, properties: { userProperties: { version: '1.0.0' } } });

    // Publish online status
    client.publish('services/baggage-handler-01/status', JSON.stringify({
        status: 'online'
    }), { retain: true, properties: { userProperties: { version: '1.0.0' } } });
});
```

---

## Phase 5: Configuration

### Files to Update

```
emqx-edge/
├── config/
│   ├── nanomq_pwd.conf      ← Add your service credentials
│   └── nanomq_acl.conf      ← Configure topic permissions
└── docker-compose.yml       ← Adjust ports if needed
```

### Add Credentials
```
# nanomq_pwd.conf
my-service:my-password
```

### Update ACL
```
# nanomq_acl.conf
allow, user my-service, pubsub, request/#
allow, user my-service, pubsub, response/#
allow, user my-service, pubsub, events/#
allow, user my-service, pubsub, services/#
```

---

## Phase 6: Verification Checklist

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MIGRATION CHECKLIST                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  □  1. EMQX Edge running                docker-compose up -d            │
│  □  2. Dashboard accessible             http://localhost:8081           │
│  □  3. Test connection works            npm run test-connection         │
│  □  4. protocolVersion: 5 set           In all mqtt.connect() calls     │
│  □  5. userProperties included          In all publish() calls          │
│  □  6. LWT configured                   In connect options              │
│  □  7. Retained msgs for registry       capabilities + status           │
│  □  8. ACL rules updated                nanomq_acl.conf                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

| Feature | mb-server-node | MQTT 5.0 |
|:--------|:---------------|:---------|
| Wildcards | `*` | `#` (multi) or `+` (single) |
| Versioning | Header string | `userProperties.version` |
| Payload | JSON object | JSON string (`JSON.stringify`) |
| Request ID | Broker-generated | Client-generated (`correlationData`) |
| Discovery | `client.getServices()` | Subscribe to `services/+/capabilities` |
| Heartbeat | Built-in | Publish to `heartbeat/{id}` |

---

## Common Issues

### "Not receiving responses"
- Check you subscribed to `response/{clientId}/#` before sending request
- Verify `responseTopic` property is set correctly
- Ensure responder is echoing `correlationData`

### "Service not discovered"
- Verify capabilities published with `retain: true`
- Check subscriber is using `services/+/capabilities` wildcard
- Ensure no ACL blocking the topic

### "LWT not firing"
- Must set `will` in connect options, not after connect
- Verify `retain: true` on LWT
- Only fires on unclean disconnect (not `client.end()`)

---

## Next Steps

1. **[Architecture Mapping](architecture-mapping.md)** — Understand the full architecture
2. **[Topic Design](topic-design.md)** — Topic naming conventions
3. **[Examples](../examples/)** — Working code samples
