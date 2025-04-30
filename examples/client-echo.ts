import { WebSocket } from "ws";
import { Socket } from "net";
import { randomUUID } from "crypto";
import { config } from "../src/config";
import { ActionType } from "../src/core/types";
import { connect as tlsConnect } from "tls";

// Configuration flags to enable/disable different roles
const ENABLE_REQUESTER = true;
const ENABLE_RESPONDER = true;
const ENABLE_LISTENER = true;
const ENABLE_SORT_CLIENT = true;

// Helper function to create message headers
function createHeader(
    action: ActionType,
    topic: string,
    requestId?: string,
    parentRequestId?: string,
    timeout?: number
) {
    let header = `${action}:${topic}:1.0.0`;

    // Add the requestId, parentRequestId, and timeout to the header line if present
    if (timeout) header += `:${requestId ?? ""}:${parentRequestId ?? ""}:${timeout}`;
    else if (parentRequestId && parentRequestId !== requestId) header += `:${requestId ?? ""}:${parentRequestId}`;
    else if (requestId) header += `:${requestId}`;

    return header;
}

// Helper function to create full message with payload
function createMessage(
    action: ActionType,
    topic: string,
    payload: any = {},
    requestId?: string,
    parentRequestId?: string,
    timeout?: number
) {
    return createHeader(action, topic, requestId, parentRequestId, timeout) + "\n" + JSON.stringify(payload);
}

// Helper function for TCP framing
function frameTcpMessage(message: string): Buffer {
    const messageBuffer = Buffer.from(message);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(messageBuffer.length);
    return Buffer.concat([lengthBuffer, messageBuffer]);
}

// Create WebSocket connections based on configuration
const wsProtocol = process.env.WS_PROTOCOL ?? "ws";
const wsPort = wsProtocol === "wss" ? config.ports.wss : config.ports.ws;
const requester = ENABLE_REQUESTER ? new WebSocket(`${wsProtocol}://${config.host}:${wsPort}`) : null;
const listener = ENABLE_LISTENER ? new WebSocket(`${wsProtocol}://${config.host}:${wsPort}`) : null;
const sortClient = ENABLE_SORT_CLIENT ? new WebSocket(`${wsProtocol}://${config.host}:${wsPort}`) : null;

// Create TCP/TLS connection for responder
const responder = ENABLE_RESPONDER
    ? wsProtocol === "wss"
        ? tlsConnect({
              host: config.host,
              port: config.ports.tls,
              //rejectUnauthorized: false,
              minVersion: "TLSv1.2",
          })
        : new Socket()
    : null;

// Requester setup
if (requester) {
    requester.on("open", () => {
        console.log("Requester connected");
        // Register as Test Requester
        requester.send(
            createMessage(
                ActionType.REQUEST,
                "system.service.register",
                {
                    name: "Test Requester",
                    description: "[WS] Sends test requests periodically",
                },
                randomUUID()
            )
        );

        if (ENABLE_LISTENER) {
            // Subscribe to test.trigger.publish
            requester.send(
                createMessage(
                    ActionType.REQUEST,
                    "system.topic.subscribe",
                    {
                        action: "request",
                        topic: "test.end",
                        priority: 2,
                    },
                    randomUUID()
                )
            );
        }

        // Send test messages every 2 seconds
        setInterval(() => {
            const requestId = randomUUID();
            requester.send(
                createMessage(
                    ActionType.REQUEST,
                    "test.message",
                    {
                        timestamp: new Date().toISOString(),
                        message: "Hello from requester!",
                    },
                    requestId
                )
            );
        }, 2000);
    });

    requester.on("message", (data: Buffer) => {
        const message = data.toString();
    });
}

// Responder setup (TCP)
if (responder) {
    // For TLS connections, we need to wait for the 'secureConnect' event
    responder.on(process.env.WS_PROTOCOL === "wss" ? "secureConnect" : "connect", () => {
        console.log("Responder connected");
        // Register as Test Responder
        responder.write(
            frameTcpMessage(
                createMessage(
                    ActionType.REQUEST,
                    "system.service.register",
                    {
                        name: "Test Responder",
                        description: "[TCP] Responds to test messages and triggers additional events using TCP",
                    },
                    randomUUID()
                )
            )
        );

        // Subscribe to test.message
        responder.write(
            frameTcpMessage(
                createMessage(
                    ActionType.REQUEST,
                    "system.topic.subscribe",
                    {
                        action: "request",
                        topic: "test.message",
                        priority: 1,
                    },
                    randomUUID()
                )
            )
        );

        if (ENABLE_LISTENER) {
            // Subscribe to test.trigger.publish
            responder.write(
                frameTcpMessage(
                    createMessage(
                        ActionType.REQUEST,
                        "system.topic.subscribe",
                        {
                            action: "request",
                            topic: "test.end",
                            priority: 0,
                        },
                        randomUUID()
                    )
                )
            );
        }
    });

    let buffer = Buffer.alloc(0);
    let expectedLength = -1;

    responder.on("data", (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        while (true) {
            // If we don't have a length yet, try to read it
            if (expectedLength === -1) {
                if (buffer.length < 4) return; // Need more data
                expectedLength = buffer.readUInt32BE(0);
                buffer = buffer.subarray(4);
            }

            // Check if we have enough data for the complete message
            if (buffer.length < expectedLength) return; // Need more data

            // Extract the message
            const messageBuffer = buffer.subarray(0, expectedLength);
            const message = messageBuffer.toString();
            buffer = buffer.subarray(expectedLength);
            expectedLength = -1;

            if (message.includes("test.message")) {
                // Echo back the original message
                const [header, payloadStr] = message.split("\n");
                const payload = JSON.parse(payloadStr);
                const [action, topic, version, requestId] = header.split(":"); // Extract original requestId

                // Send response to the original request
                responder.write(
                    frameTcpMessage(createMessage(ActionType.RESPONSE, "test.message", payload, requestId, requestId))
                );

                // Send additional trigger messages with the original request as parent
                responder.write(
                    frameTcpMessage(
                        createMessage(
                            ActionType.PUBLISH,
                            "test.trigger.publish",
                            {
                                timestamp: new Date().toISOString(),
                                triggeredBy: "responder",
                            },
                            randomUUID(),
                            requestId
                        )
                    )
                );

                responder.write(
                    frameTcpMessage(
                        createMessage(
                            ActionType.REQUEST,
                            "test.trigger.request",
                            {
                                timestamp: new Date().toISOString(),
                                triggeredBy: "responder",
                            },
                            randomUUID(),
                            requestId
                        )
                    )
                );
            }

            // If no more data to process, break
            if (buffer.length < 4) break;
        }
    });

    // Connect to the server (only for non-TLS connections)
    if (process.env.WS_PROTOCOL !== "wss") {
        responder.connect(config.ports.tcp, config.host);
    }
}

// Listener setup
if (listener) {
    listener.on("open", () => {
        console.log("Listener connected");
        // Register as Test Listener
        listener.send(
            createMessage(
                ActionType.REQUEST,
                "system.service.register",
                {
                    name: "Test Listener",
                    description: "[WS] Listens for trigger messages and sends end signal",
                },
                randomUUID()
            )
        );

        // Subscribe to both trigger topics
        listener.send(
            createMessage(
                ActionType.REQUEST,
                "system.topic.subscribe",
                {
                    action: "publish",
                    topic: "test.trigger.publish",
                    priority: 1,
                },
                randomUUID()
            )
        );
        listener.send(
            createMessage(
                ActionType.REQUEST,
                "system.topic.subscribe",
                {
                    action: "request",
                    topic: "test.trigger.request",
                    priority: 1,
                },
                randomUUID()
            )
        );
    });

    listener.on("message", (data: Buffer) => {
        const message = data.toString();
        if (message.includes("test.trigger.request")) {
            const [header, payloadStr] = message.split("\n");
            const payload = JSON.parse(payloadStr);
            const [action, topic, version, requestId] = header.split(":"); // Extract original requestId

            // Send test.trigger.response message with the trigger request as parent
            listener.send(createMessage(ActionType.RESPONSE, "test.trigger.request", payload, requestId));

            // Send test.no_route publish message with the trigger request as parent
            listener.send(
                createMessage(
                    ActionType.REQUEST,
                    "test.noroute",
                    {
                        timestamp: new Date().toISOString(),
                        triggeredBy: "listener",
                    },
                    randomUUID(),
                    requestId
                )
            );

            // Send test.end publish message with the trigger request as parent
            listener.send(
                createMessage(
                    ActionType.REQUEST,
                    "test.end",
                    {
                        timestamp: new Date().toISOString(),
                        triggeredBy: "listener",
                    },
                    randomUUID(),
                    requestId,
                    500
                )
            );
        }
    });
}

// Sort Client setup (WebSocket)
if (sortClient) {
    sortClient.on("open", () => {
        console.log("Sort Client connected");
        // Register as Sort Responder Service
        sortClient.send(
            createMessage(
                ActionType.REQUEST,
                "system.service.register",
                {
                    name: "Sort Responder Service",
                    description: "[WS] Responds to common.sort.request messages",
                },
                randomUUID()
            )
        );

        // Subscribe to common.sort.request
        sortClient.send(
            createMessage(
                ActionType.REQUEST,
                "system.topic.subscribe",
                {
                    action: "request",
                    topic: "common.sort.request",
                    priority: 1,
                },
                randomUUID()
            )
        );
    });

    sortClient.on("message", (data: Buffer) => {
        const message = data.toString();
        console.log(`Sort Client Received: ${message.split("\n")[0]}`);

        // Check if it's a heartbeat request from the server
        if (message.startsWith(`${ActionType.REQUEST}:system.heartbeat`)) {
            try {
                const [header] = message.split("\n");
                const [action, topic, version, requestId] = header.split(":"); // Extract original requestId
                // Respond to the heartbeat
                sortClient.send(createMessage(ActionType.RESPONSE, "system.heartbeat", {}, requestId, requestId));
                console.log(`Sort Client Sent heartbeat response for ${requestId}`);
            } catch (error: any) {
                console.error("Sort Client: Error processing heartbeat request:", error);
            }
        } else if (message.startsWith(`${ActionType.REQUEST}:common.sort.request`)) {
            try {
                const [header, payloadStr] = message.split("\n");
                const payload = JSON.parse(payloadStr);
                const [action, topic, version, requestId] = header.split(":");

                let itemCount = 0;
                // Check for format 1: { iata: [...] }
                if (Array.isArray(payload.iata)) {
                    itemCount = payload.iata.length;
                }
                // Check for format 2: { barcodes: [...] }
                else if (Array.isArray(payload.barcodes)) {
                    itemCount = payload.barcodes.length;
                } else {
                    console.error("Sort Client: Received sort request with unknown payload format:", payload);
                    return;
                }

                // Generate destinations array
                const destinations = [];
                for (let i = 0; i < itemCount; i++) {
                    destinations.push((i + 1).toString());
                }

                // Create response payload
                const responsePayload = { destinations };

                // Send response
                sortClient.send(
                    createMessage(ActionType.RESPONSE, "common.sort.request", responsePayload, requestId, requestId)
                );
                console.log(`Sort Client Sent response for ${requestId}:`, responsePayload);
            } catch (error: any) {
                console.error("Sort Client: Error processing sort request:", error);
                // Handle parsing errors, potentially notify the sender if a requestId is available
                const headerMatch = message.match(/^(request:[^:]+:[^:]+):([^:\n]+)/);
                if (headerMatch && headerMatch[2]) {
                }
            }
        } else if (
            message.startsWith(`${ActionType.RESPONSE}:system.service.register`) ||
            message.startsWith(`${ActionType.RESPONSE}:system.topic.subscribe`)
        ) {
            console.log(`Sort Client Received system response: ${message.split("\n")[0]}`);
        } else {
            console.log(`Sort Client Received unhandled message: ${message.split("\n")[0]}`);
        }
    });
}

// Error handling for all connections
const activeConnections = [
    { ws: requester, name: "Requester" },
    { ws: responder, name: "Responder (TCP)", isTcp: true },
    { ws: listener, name: "Listener" },
    { ws: sortClient, name: "Sort Client" },
].filter((conn) => conn.ws !== null);

activeConnections.forEach(({ ws, name, isTcp }) => {
    if (isTcp) {
        // TCP error handling
        (ws as Socket).on("error", (err: Error) => {
            console.error(`${name} error:`, err);
            if (err.message.includes("ECONNREFUSED")) {
                console.error(
                    `Could not connect to the Message Broker. Make sure it is running and the host/port are correct.`
                );
            }
            process.exit(1);
        });

        (ws as Socket).on("close", () => {
            console.log(`${name} disconnected`);
            process.exit(0);
        });
    } else {
        // WebSocket error handling
        (ws as WebSocket).on("error", (err: Error) => {
            console.error(`${name} error:`, err);
            if (err.message.includes("ECONNREFUSED")) {
                console.error(
                    `Could not connect to the Message Broker. Make sure it is running and the host/port are correct.`
                );
            }
            process.exit(1);
        });

        (ws as WebSocket).on("close", () => {
            console.log(`${name} disconnected`);
            process.exit(0);
        });
    }
});
