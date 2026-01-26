# NABHAS Topic Design

This guide defines topic naming conventions for NABHAS-compliant MQTT 5.0 implementations.

---

## Topic Hierarchy

```
                              (root)
                                │
        ┌───────────┬───────────┼───────────┬───────────┬───────────┐
        │           │           │           │           │           │
    services/   request/    response/   events/    heartbeat/  metrics/
        │           │           │           │           │           │
    ┌───┴───┐   ┌───┴───┐   ┌───┴───┐   ┌───┴───┐      │           │
    │       │   │       │   │       │   │       │      │           │
 register  {id}/  {svc}/  {client}/ {domain}/   {id}       {id}/
              │       │       │       │                     │
          ┌───┴───┐   │    {reqId}  {type}              {name}
          │       │   │
    capabilities status {action}
```

---

## Topic Categories

| Category | Pattern | Retain | QoS | Purpose |
|:---------|:--------|:------:|:---:|:--------|
| **Registration** | `services/register` | No | 1 | Service announces itself |
| **Capabilities** | `services/{id}/capabilities` | Yes | 1 | What a service can do |
| **Status** | `services/{id}/status` | Yes | 1 | Online/offline (+ LWT) |
| **Requests** | `request/{service}/{action}` | No | 1 | RPC-style calls |
| **Responses** | `response/{client}/{reqId}` | No | 1 | RPC responses |
| **Events** | `events/{domain}/{type}` | No | 1 | Broadcast notifications |
| **Commands** | `commands/{target}/{action}` | No | 1-2 | Direct instructions |
| **Heartbeats** | `heartbeat/{id}` | Yes | 0 | Health signals |
| **Metrics** | `metrics/{id}/{name}` | No | 0 | Performance data |

---

## Naming Rules

```
  ✓ CORRECT                          ✗ INCORRECT
  ─────────────────────────────────────────────────────────
  services/baggage-handler/status    Services/BaggageHandler/Status
  events/baggage/arrival             events/baggage/arrival/v1
  request/sac/sort                   request/SAC/Sort
```

1. **Lowercase only** — Use `a-z`, `0-9`, `-`, `_`
2. **No PII** — Never include passenger data in topics
3. **No versions in topics** — Use `User Property` instead
4. **Hierarchical** — Use `/` to separate levels

---

## Service Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE STARTUP                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Step 1: Connect with Last Will (LWT)                                  │
│   ─────────────────────────────────────                                 │
│   LWT Topic:   services/{id}/status                                     │
│   LWT Payload: {"status": "offline"}                                    │
│   LWT Retain:  true                                                     │
│                                                                         │
│   Step 2: Publish capabilities (retained)                               │
│   ────────────────────────────────────────                              │
│   Topic:   services/{id}/capabilities                                   │
│   Payload: {"capabilities": ["sort","lookup"], "version": "1.0.0"}      │
│   Retain:  true                                                         │
│                                                                         │
│   Step 3: Publish online status (retained)                              │
│   ────────────────────────────────────────                              │
│   Topic:   services/{id}/status                                         │
│   Payload: {"status": "online", "uptime": 0}                            │
│   Retain:  true                                                         │
│                                                                         │
│   Step 4: Start heartbeat loop                                          │
│   ─────────────────────────────                                         │
│   Topic:   heartbeat/{id}                                               │
│   Payload: {"timestamp": "...", "healthy": true}                        │
│   Retain:  true                                                         │
│   Interval: 30 seconds                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Request-Response Flow

```
  CLIENT                           BROKER                          SERVICE
    │                                │                                │
    │  ① Subscribe to response inbox │                                │
    │  ──────────────────────────────►                                │
    │  response/client-01/#          │                                │
    │                                │                                │
    │  ② Publish request             │                                │
    │  ──────────────────────────────►  ③ Route by topic              │
    │                                │  ──────────────────────────────►
    │  Topic: request/sac/sort       │                                │
    │  Props:                        │                                │
    │    responseTopic: response/client-01/req-123                    │
    │    correlationData: req-123    │                                │
    │    userProperties: {version}   │                                │
    │                                │                                │
    │                                │  ④ Respond to responseTopic    │
    │                                │◄───────────────────────────────│
    │  ⑤ Receive (match by corrData) │                                │
    │◄───────────────────────────────│  Topic: response/client-01/req-123
    │                                │  Props:                        │
    │                                │    correlationData: req-123    │
```

**Requester code:**
```javascript
client.publish('request/sac/sort', JSON.stringify({ bagId: 'ABC' }), {
    properties: {
        responseTopic: `response/${clientId}/req-123`,
        correlationData: Buffer.from('req-123'),
        userProperties: { version: '1.0.0' }
    }
});
```

**Responder code:**
```javascript
client.on('message', (topic, payload, packet) => {
    const result = processRequest(payload);
    client.publish(packet.properties.responseTopic, JSON.stringify(result), {
        properties: {
            correlationData: packet.properties.correlationData,
            userProperties: { version: '1.0.0' }
        }
    });
});
```

---

## Wildcard Subscriptions

| Pattern | Matches | Use Case |
|:--------|:--------|:---------|
| `services/+/status` | All service statuses | Monitoring dashboard |
| `services/+/capabilities` | All service capabilities | Service discovery |
| `events/baggage/#` | All baggage events | Baggage tracking |
| `events/+/arrival` | Arrivals from any domain | Cross-domain logging |
| `response/my-id/#` | All my responses | Client response handler |
| `heartbeat/+` | All heartbeats | Health monitor |

---

## QoS Guidelines

```
  QoS 0 (At most once)     QoS 1 (At least once)     QoS 2 (Exactly once)
  ─────────────────────    ─────────────────────     ─────────────────────
  • Heartbeats             • Events                  • Critical commands
  • Metrics                • Requests                • Financial transactions
  • Telemetry              • Responses
                           • Service registration
```

---

## Summary

| Requirement | Implementation |
|:------------|:---------------|
| Service ID | MQTT `clientId` or `username` |
| Message version | `userProperties: { version: '1.0.0' }` |
| Request correlation | `correlationData` property |
| Response routing | `responseTopic` property |
| Persistence | `retain: true` (capabilities, status) |
| Offline detection | Last Will and Testament (LWT) |

---

## Next Steps

1. **[Architecture Mapping](architecture-mapping.md)** — How NABHAS maps to MQTT 5.0
2. **[Migration Guide](migration-guide.md)** — Step-by-step migration
3. **[Examples](../examples/)** — Working TypeScript implementations
