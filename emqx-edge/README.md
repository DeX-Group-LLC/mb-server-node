# EMQX Edge — MQTT 5.0 Message Broker

An alternative to `mb-server-node` using standard **MQTT 5.0** protocol via [EMQX Edge](https://docs.emqx.com/en/emqx-edge/latest/).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                            EMQX Edge Broker                             │
│                                                                         │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│    │ TCP:1883 │   │ WS:8083  │   │ TLS:8883 │   │HTTP:8081 │           │
│    │  (MQTT)  │   │  (MQTT)  │   │  (MQTT)  │   │(Dashboard)│           │
│    └────┬─────┘   └────┬─────┘   └────┬─────┘   └──────────┘           │
│         │              │              │                                 │
│         └──────────────┴──────────────┘                                 │
│                        │                                                │
│              ┌─────────┴─────────┐                                      │
│              │   Topic Router    │                                      │
│              │   (Pub/Sub)       │                                      │
│              └─────────┬─────────┘                                      │
│                        │                                                │
└────────────────────────┼────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │Service A │    │Service B │    │Service C │
   │(Handler) │    │(Scanner) │    │(Display) │
   └──────────┘    └──────────┘    └──────────┘
```

---

## Quick Start

```cmd
:: 1. Start the broker
docker-compose up -d

:: 2. Verify it works
cd examples
npm install
npm run test-connection

:: 3. Access dashboard
:: Open http://localhost:8081 (admin / public)
```

**One-command start:**
```cmd
scripts\quickstart.cmd
```

---

## Why MQTT 5.0?

| mb-server-node | EMQX Edge |
|:---------------|:----------|
| Custom protocol | Standard MQTT 5.0 |
| Custom client library | Any MQTT client works |
| Built-in registry | Retained messages + LWT |
| Custom headers | Native MQTT properties |

**Result:** Use Paho, mqtt.js, or any MQTT library. No vendor lock-in.

---

## Ports

| Port | Protocol | Purpose |
|:-----|:---------|:--------|
| 1883 | MQTT TCP | Standard MQTT |
| 8083 | WebSocket | Browser clients |
| 8883 | MQTT TLS | Encrypted MQTT |
| 8081 | HTTP | Dashboard + API |

---

## Topic Structure

```
services/
├── register                    ← Service announces itself
├── {serviceId}/
│   ├── capabilities            ← What it can do (retained)
│   └── status                  ← Online/offline (retained + LWT)

request/{service}/{action}      ← RPC requests
response/{clientId}/{reqId}     ← RPC responses

events/{domain}/{type}          ← Broadcast events
heartbeat/{serviceId}           ← Health signals
metrics/{serviceId}/{name}      ← Performance data
```

See [Topic Design](docs/topic-design.md) for details.

---

## Message Flow: Request-Response

```
  Client                        Broker                        Service
    │                             │                             │
    │  1. Subscribe               │                             │
    │  response/client-01/#       │                             │
    │ ───────────────────────────►│                             │
    │                             │                             │
    │  2. Request                 │  3. Route                   │
    │  request/sac/lookup         │ ────────────────────────────►
    │  + responseTopic            │                             │
    │  + correlationData          │                             │
    │ ───────────────────────────►│                             │
    │                             │                             │
    │                             │  4. Response                │
    │  5. Receive                 │◄────────────────────────────│
    │◄───────────────────────────│  response/client-01/req-123 │
    │                             │  + correlationData          │
```

---

## Connect (JavaScript)

```javascript
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883', {
    protocolVersion: 5,              // ← Required for MQTT 5.0 features
    username: 'client',
    password: 'client123',
    will: {                          // ← Auto-publish on crash
        topic: 'services/my-service/status',
        payload: JSON.stringify({ status: 'offline' }),
        retain: true
    }
});

client.on('connect', () => {
    // Subscribe
    client.subscribe('events/#');

    // Publish with version metadata
    client.publish('events/test/hello', JSON.stringify({ msg: 'hi' }), {
        properties: { userProperties: { version: '1.0.0' } }
    });
});
```

---

## Connect (Python)

```python
import paho.mqtt.client as mqtt

client = mqtt.Client(protocol=mqtt.MQTTv5)
client.username_pw_set("client", "client123")

def on_connect(client, userdata, flags, rc, properties=None):
    client.subscribe("events/#")

client.on_connect = on_connect
client.connect("localhost", 1883, 60)
client.loop_forever()
```

---

## Configuration

| File | Purpose |
|:-----|:--------|
| `config/nanomq.conf` | Main broker config |
| `config/nanomq_pwd.conf` | Credentials |
| `config/nanomq_acl.conf` | Topic permissions |

**Default credentials:**
| User | Password | Purpose |
|:-----|:---------|:--------|
| admin | public | Dashboard |
| client | client123 | Client apps |
| service | service123 | Backend services |

---

## Examples

| File | Demonstrates |
|:-----|:-------------|
| `test-connection.ts` | Verify broker is working |
| `mqtt-client.ts` | Basic pub/sub |
| `websocket-client.ts` | Browser-compatible client |
| `request-response.ts` | RPC pattern |
| `service-registration.ts` | Service discovery + heartbeats |

```cmd
cd examples
npm install
npx ts-node mqtt-client.ts
```

---

## Troubleshooting

**Container won't start:**
```cmd
netstat -an | findstr "1883 8081 8083"
docker-compose logs emqx-edge
```

**Connection refused:**
```cmd
docker-compose ps
docker inspect emqx-edge --format="{{.State.Health.Status}}"
```

**Auth failures:**
- Check `config/nanomq_pwd.conf`
- Check `config/nanomq_acl.conf`

---

## Documentation

| Document | Content |
|:---------|:--------|
| [Architecture Mapping](docs/architecture-mapping.md) | NABHAS → MQTT 5.0 |
| [Topic Design](docs/topic-design.md) | Naming conventions |
| [Migration Guide](docs/migration-guide.md) | From mb-server-node |

---

## External Links

- [EMQX Edge Docs](https://docs.emqx.com/en/emqx-edge/latest/)
- [MQTT 5.0 Spec](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [mqtt.js](https://github.com/mqttjs/MQTT.js)
- [Paho Python](https://github.com/eclipse/paho.mqtt.python)
