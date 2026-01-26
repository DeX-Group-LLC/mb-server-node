# NABHAS Architecture: Native MQTT 5.0 Alignment

This guide shows how NABHAS goals are achieved using **Native MQTT 5.0** features—no custom broker code required.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EMQX Edge Broker                              │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  TCP:1883   │  │  WS:8083    │  │  TLS:8883   │  │  HTTP:8081  │     │
│  │   (MQTT)    │  │   (MQTT)    │  │   (MQTT)    │  │ (Dashboard) │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘     │
│         │                │                │                             │
│         └────────────────┴────────────────┘                             │
│                          │                                              │
│              ┌───────────┴───────────┐                                  │
│              │    Message Router     │                                  │
│              │  (Topic-based Pub/Sub)│                                  │
│              └───────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────────┐  ┌───────────────┐  ┌───────────────┐
│   Service A     │  │   Service B   │  │   Service C   │
│ (BaggageHandler)│  │  (Conveyor)   │  │   (Scanner)   │
└─────────────────┘  └───────────────┘  └───────────────┘
```

---

## NABHAS Requirements → MQTT 5.0

| NABHAS Req | Description | MQTT 5.0 Solution |
|:-----------|:------------|:------------------|
| **R-1** | Central message broker | EMQX Edge |
| **R-2** | TCP + WebSocket support | Ports 1883, 8083 |
| **R-4** | Structured message format | MQTT 5.0 Properties |
| **R-5** | Service registry | Retained messages + LWT |
| **R-7** | Request-response | Response Topic + Correlation Data |
| **R-8** | Security | TLS + ACL |

---

## Message Metadata Mapping

Instead of custom headers like `action:topic:version`, use native MQTT 5.0 properties:

```
┌─────────────────────────────────────────────────────────────┐
│                    MQTT 5.0 PUBLISH Packet                  │
├─────────────────────────────────────────────────────────────┤
│  Topic:           request/baggage/lookup                    │
│  Payload:         {"baggageId": "ABC123"}                   │
├─────────────────────────────────────────────────────────────┤
│  Properties:                                                │
│    ├─ Response Topic:    response/client-01/req-456         │
│    ├─ Correlation Data:  req-456                            │
│    ├─ Message Expiry:    30 (seconds)                       │
│    └─ User Properties:   { "version": "1.0.0" }             │
└─────────────────────────────────────────────────────────────┘
```

---

## Pattern 1: Service Registry & Discovery

Services announce themselves using **retained messages** and **Last Will (LWT)**.

```
                    STARTUP                              CRASH/DISCONNECT
                       │                                        │
     ┌─────────────────┴─────────────────┐                      │
     │           Service A               │                      │
     │                                   │                      │
     │  1. Connect with LWT:             │         Broker auto-publishes LWT:
     │     topic: services/A/status      │         ─────────────────────────►
     │     payload: {status:"offline"}   │              services/A/status
     │     retain: true                  │              {status:"offline"}
     │                                   │
     │  2. Publish capabilities:         │
     │     topic: services/A/capabilities│
     │     payload: {caps:[...]}         │
     │     retain: true ────────────────►│
     │                                   │
     │  3. Publish status online:        │
     │     topic: services/A/status      │
     │     payload: {status:"online"}    │
     │     retain: true ────────────────►│
     └───────────────────────────────────┘

                    DISCOVERY
                       │
     ┌─────────────────┴──────────────────┐
     │           Service B                │
     │                                    │
     │  Subscribe: services/+/capabilities│
     │  ◄─────────────────────────────────│  (Receives all retained caps)
     │                                    │
     │  Subscribe: services/+/status      │
     │  ◄─────────────────────────────────│  (Receives all retained statuses)
     └────────────────────────────────────┘
```

---

## Pattern 2: Request-Response

MQTT 5.0 provides native request-response via `Response Topic` and `Correlation Data`.

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│   Client     │                    │    Broker    │                    │   Service    │
│  (Requester) │                    │  (EMQX Edge) │                    │ (Responder)  │
└──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
       │                                   │                                   │
       │  1. Subscribe to response inbox   │                                   │
       │ ─────────────────────────────────►│                                   │
       │   response/client-01/#            │                                   │
       │                                   │                                   │
       │  2. Publish request               │                                   │
       │ ─────────────────────────────────►│  3. Route to service              │
       │   Topic: request/baggage/lookup   │ ─────────────────────────────────►│
       │   Props:                          │                                   │
       │     responseTopic: response/...   │                                   │
       │     correlationData: req-456      │                                   │
       │                                   │                                   │
       │                                   │  4. Process & respond             │
       │                                   │◄──────────────────────────────────│
       │                                   │   Topic: response/client-01/...   │
       │  5. Receive response              │   Props:                          │
       │◄──────────────────────────────────│     correlationData: req-456      │
       │   (matched by correlationData)    │                                   │
       │                                   │                                   │
```

---

## Pattern 3: Events (Pub/Sub)

Standard publish-subscribe for broadcasting system events.

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  Publisher   │          │    Broker    │          │ Subscribers  │
│  (Scanner)   │          │              │          │              │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
       │  Publish:               │                         │
       │  events/baggage/scanned │                         │
       │ ───────────────────────►│                         │
       │                         │  Fan-out to all         │
       │                         │  subscribers of:        │
       │                         │  - events/baggage/#     │
       │                         │  - events/+/scanned     │
       │                         │  - events/#             │
       │                         │ ───────────────────────►│
       │                         │                         │
```

---

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. TRANSPORT          TLS 1.2/1.3 on port 8883             │
│     ────────────────────────────────────────────            │
│                                                             │
│  2. AUTHENTICATION     Username/Password in CONNECT         │
│     ────────────────────────────────────────────            │
│     Config: nanomq_pwd.conf                                 │
│                                                             │
│  3. AUTHORIZATION      Topic-level ACL                      │
│     ────────────────────────────────────────────            │
│     Config: nanomq_acl.conf                                 │
│     Example: allow, user service, pub, request/#            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Why Native MQTT 5.0?

| Benefit | Description |
|:--------|:------------|
| **Interoperability** | Any MQTT client library works (Paho, MQTT.js, etc.) |
| **Performance** | EMQX Edge optimized for < 5ms latency |
| **Scalability** | Clustering + cloud bridging built-in |
| **Tooling** | MQTT Explorer, EMQX Dashboard, Wireshark |

---

## Next Steps

1. **[Topic Design](topic-design.md)** — Topic naming conventions
2. **[Migration Guide](migration-guide.md)** — Step-by-step migration
3. **[Examples](../examples/)** — Working TypeScript code
