# Documentation

## Reading Order

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   START HERE                                                            │
│       │                                                                 │
│       ▼                                                                 │
│   ┌─────────────────────────┐                                           │
│   │  Architecture Mapping   │  Understand how NABHAS maps to MQTT 5.0   │
│   └───────────┬─────────────┘                                           │
│               │                                                         │
│               ▼                                                         │
│   ┌─────────────────────────┐                                           │
│   │     Topic Design        │  Learn the topic naming conventions       │
│   └───────────┬─────────────┘                                           │
│               │                                                         │
│               ▼                                                         │
│   ┌─────────────────────────┐                                           │
│   │    Migration Guide      │  Step-by-step migration from mb-server    │
│   └───────────┬─────────────┘                                           │
│               │                                                         │
│               ▼                                                         │
│   ┌─────────────────────────┐                                           │
│   │       Examples          │  Working TypeScript code                  │
│   └─────────────────────────┘                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Documents

| Document | Description |
|:---------|:------------|
| [Architecture Mapping](architecture-mapping.md) | How NABHAS requirements map to MQTT 5.0 features |
| [Topic Design](topic-design.md) | Topic hierarchy, naming rules, QoS guidelines |
| [Migration Guide](migration-guide.md) | Step-by-step migration from mb-server-node |

---

## Quick Reference

**Ports:**
- `1883` — MQTT (TCP)
- `8083` — MQTT (WebSocket)
- `8883` — MQTT (TLS)
- `8081` — Dashboard

**Credentials:**
- Dashboard: `admin` / `public`
- Clients: `client` / `client123`
- Services: `service` / `service123`

**Config files:**
- `config/nanomq.conf` — Main config
- `config/nanomq_pwd.conf` — Credentials
- `config/nanomq_acl.conf` — Topic ACL

---

## Examples

| File | What it shows |
|:-----|:--------------|
| `test-connection.ts` | Verify broker works |
| `mqtt-client.ts` | Basic pub/sub |
| `websocket-client.ts` | Browser client |
| `request-response.ts` | RPC pattern |
| `service-registration.ts` | Service discovery |

Run examples:
```cmd
cd examples
npm install
npx ts-node mqtt-client.ts
```
