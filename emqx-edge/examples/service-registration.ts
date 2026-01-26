/**
 * Service Registration Example for EMQX Edge
 *
 * This example demonstrates implementing service registration, discovery,
 * and heartbeat patterns using MQTT topics and retained messages.
 *
 * Usage:
 *   npx ts-node examples/service-registration.ts
 *
 * Prerequisites:
 *   - EMQX Edge running (docker-compose up -d)
 *   - npm install mqtt
 */

import * as mqtt from 'mqtt';

/** Service information */
interface ServiceInfo {
    /** Unique service identifier */
    serviceId: string;
    /** Human-readable service name */
    serviceName: string;
    /** Service version */
    version: string;
    /** Service capabilities/endpoints */
    capabilities: string[];
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/** Service status */
interface ServiceStatus {
    /** Current status */
    status: 'online' | 'offline' | 'degraded';
    /** Last update timestamp */
    lastUpdate: string;
    /** Uptime in seconds */
    uptime?: number;
    /** Health metrics */
    health?: {
        cpu?: number;
        memory?: number;
        connections?: number;
    };
}

/**
 * Service Registry Client
 *
 * Manages service registration, heartbeats, and status updates.
 */
class ServiceRegistry {
    /** MQTT client instance */
    private client: mqtt.MqttClient;

    /** Service information */
    private serviceInfo: ServiceInfo;

    /** Heartbeat interval timer */
    private heartbeatTimer?: NodeJS.Timeout;

    /** Service start time */
    private startTime: number = Date.now();

    /**
     * Creates a new service registry client.
     *
     * @param brokerUrl - MQTT broker URL
     * @param username - Authentication username
     * @param password - Authentication password
     * @param serviceInfo - Service information
     */
    constructor(
        brokerUrl: string,
        username: string,
        password: string,
        serviceInfo: ServiceInfo
    ) {
        this.serviceInfo = serviceInfo;

        this.client = mqtt.connect(brokerUrl, {
            username,
            password,
            clientId: serviceInfo.serviceId,
            clean: true,
            reconnectPeriod: 1000,
            protocolVersion: 5, // Use MQTT 5.0
            // Last Will: automatically set status to offline if disconnected
            will: {
                topic: `services/${serviceInfo.serviceId}/status`,
                payload: JSON.stringify({
                    status: 'offline',
                    lastUpdate: new Date().toISOString()
                } as ServiceStatus),
                retain: true,
                qos: 1,
                properties: {
                    userProperties: { version: serviceInfo.version }
                }
            }
        });
    }

    /**
     * Registers the service and starts heartbeat.
     *
     * @param heartbeatIntervalMs - Heartbeat interval in milliseconds
     * @returns Promise that resolves when registered
     */
    async register(heartbeatIntervalMs: number = 30000): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.on('connect', () => {
                console.log(`[${this.serviceInfo.serviceId}] Connected to broker`);

                // Publish registration announcement
                this.client.publish(
                    'services/register',
                    JSON.stringify({
                        ...this.serviceInfo,
                        timestamp: new Date().toISOString()
                    }),
                    { 
                        qos: 1,
                        properties: {
                            userProperties: { version: this.serviceInfo.version }
                        }
                    }
                );
                console.log(`[${this.serviceInfo.serviceId}] Published registration`);

                // Publish capabilities (retained)
                this.client.publish(
                    `services/${this.serviceInfo.serviceId}/capabilities`,
                    JSON.stringify({
                        capabilities: this.serviceInfo.capabilities,
                        version: this.serviceInfo.version
                    }),
                    { 
                        retain: true, 
                        qos: 1,
                        properties: {
                            userProperties: { version: this.serviceInfo.version }
                        }
                    }
                );

                // Set initial status
                this.updateStatus('online');

                // Start heartbeat
                this.startHeartbeat(heartbeatIntervalMs);

                resolve();
            });

            this.client.on('error', reject);
        });
    }

    /**
     * Updates service status.
     *
     * @param status - New status
     * @param health - Optional health metrics
     */
    updateStatus(status: ServiceStatus['status'], health?: ServiceStatus['health']): void {
        const statusPayload: ServiceStatus = {
            status,
            lastUpdate: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            health
        };

        this.client.publish(
            `services/${this.serviceInfo.serviceId}/status`,
            JSON.stringify(statusPayload),
            { 
                retain: true, 
                qos: 1,
                properties: {
                    userProperties: { version: this.serviceInfo.version }
                }
            }
        );

        console.log(`[${this.serviceInfo.serviceId}] Status: ${status}`);
    }

    /**
     * Starts periodic heartbeat publishing.
     *
     * @param intervalMs - Heartbeat interval in milliseconds
     */
    private startHeartbeat(intervalMs: number): void {
        const sendHeartbeat = () => {
            const heartbeat = {
                timestamp: new Date().toISOString(),
                status: 'healthy',
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                metrics: {
                    // Simulated metrics
                    cpu: Math.random() * 100,
                    memory: Math.random() * 100
                }
            };

            this.client.publish(
                `heartbeat/${this.serviceInfo.serviceId}`,
                JSON.stringify(heartbeat),
                { 
                    retain: true, 
                    qos: 0,
                    properties: {
                        userProperties: { version: this.serviceInfo.version }
                    }
                }
            );
        };

        // Send initial heartbeat
        sendHeartbeat();

        // Schedule periodic heartbeats
        this.heartbeatTimer = setInterval(sendHeartbeat, intervalMs);
        console.log(`[${this.serviceInfo.serviceId}] Heartbeat started (${intervalMs}ms interval)`);
    }

    /**
     * Deregisters the service.
     */
    async deregister(): Promise<void> {
        // Stop heartbeat
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        // Publish deregistration
        this.client.publish(
            'services/deregister',
            JSON.stringify({
                serviceId: this.serviceInfo.serviceId,
                timestamp: new Date().toISOString()
            }),
            { 
                qos: 1,
                properties: {
                    userProperties: { version: this.serviceInfo.version }
                }
            }
        );

        // Update status to offline
        this.updateStatus('offline');

        // Clear retained messages
        this.client.publish(`heartbeat/${this.serviceInfo.serviceId}`, '', { 
            retain: true,
            properties: { userProperties: { version: this.serviceInfo.version } }
        });
        this.client.publish(`services/${this.serviceInfo.serviceId}/capabilities`, '', { 
            retain: true,
            properties: { userProperties: { version: this.serviceInfo.version } }
        });

        console.log(`[${this.serviceInfo.serviceId}] Deregistered`);

        // Disconnect
        this.client.end();
    }
}

/**
 * Service Discovery Client
 *
 * Discovers and monitors registered services.
 */
class ServiceDiscovery {
    /** MQTT client instance */
    private client: mqtt.MqttClient;

    /** Discovered services */
    private services: Map<string, {
        info: ServiceInfo;
        status: ServiceStatus;
        lastHeartbeat?: string;
    }> = new Map();

    /** Event handlers */
    private handlers: {
        onServiceOnline?: (serviceId: string, info: ServiceInfo) => void;
        onServiceOffline?: (serviceId: string) => void;
        onServiceStatusChange?: (serviceId: string, status: ServiceStatus) => void;
    } = {};

    /**
     * Creates a new service discovery client.
     *
     * @param brokerUrl - MQTT broker URL
     * @param username - Authentication username
     * @param password - Authentication password
     */
    constructor(brokerUrl: string, username: string, password: string) {
        const clientId = `discovery-${Date.now()}`;

        this.client = mqtt.connect(brokerUrl, {
            username,
            password,
            clientId,
            clean: true,
            reconnectPeriod: 1000,
            protocolVersion: 5 // Use MQTT 5.0 for consistency
        });

        this.setupMessageHandlers();
    }

    /**
     * Starts service discovery.
     *
     * @returns Promise that resolves when ready
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.on('connect', () => {
                console.log('[Discovery] Connected to broker');

                // Subscribe to service topics
                this.client.subscribe([
                    'services/register',
                    'services/deregister',
                    'services/+/status',
                    'services/+/capabilities',
                    'heartbeat/+'
                ], { qos: 1 }, (err: Error | null) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('[Discovery] Subscribed to service topics');
                        resolve();
                    }
                });
            });

            this.client.on('error', reject);
        });
    }

    /**
     * Sets up message handlers for service events.
     */
    private setupMessageHandlers(): void {
        this.client.on('message', (topic: string, payload: Buffer) => {
            const payloadStr = payload.toString();

            // Ignore empty payloads (cleared retained messages)
            if (!payloadStr) return;

            try {
                const data = JSON.parse(payloadStr);

                if (topic === 'services/register') {
                    this.handleRegistration(data);
                } else if (topic === 'services/deregister') {
                    this.handleDeregistration(data);
                } else if (topic.match(/^services\/[^/]+\/status$/)) {
                    const serviceId = topic.split('/')[1];
                    this.handleStatusUpdate(serviceId, data);
                } else if (topic.match(/^heartbeat\/[^/]+$/)) {
                    const serviceId = topic.split('/')[1];
                    this.handleHeartbeat(serviceId, data);
                }
            } catch (error) {
                console.error('[Discovery] Failed to parse message:', error);
            }
        });
    }

    /**
     * Handles service registration.
     */
    private handleRegistration(data: ServiceInfo & { timestamp: string }): void {
        console.log(`[Discovery] Service registered: ${data.serviceId}`);

        const existing = this.services.get(data.serviceId);
        this.services.set(data.serviceId, {
            info: data,
            status: existing?.status || { status: 'online', lastUpdate: data.timestamp }
        });

        this.handlers.onServiceOnline?.(data.serviceId, data);
    }

    /**
     * Handles service deregistration.
     */
    private handleDeregistration(data: { serviceId: string }): void {
        console.log(`[Discovery] Service deregistered: ${data.serviceId}`);

        this.services.delete(data.serviceId);
        this.handlers.onServiceOffline?.(data.serviceId);
    }

    /**
     * Handles service status update.
     */
    private handleStatusUpdate(serviceId: string, status: ServiceStatus): void {
        console.log(`[Discovery] Status update for ${serviceId}: ${status.status}`);

        const existing = this.services.get(serviceId);
        if (existing) {
            existing.status = status;

            if (status.status === 'offline') {
                this.handlers.onServiceOffline?.(serviceId);
            } else {
                this.handlers.onServiceStatusChange?.(serviceId, status);
            }
        }
    }

    /**
     * Handles heartbeat message.
     */
    private handleHeartbeat(serviceId: string, heartbeat: any): void {
        const existing = this.services.get(serviceId);
        if (existing) {
            existing.lastHeartbeat = heartbeat.timestamp;
        }
    }

    /**
     * Registers event handlers.
     */
    on(event: 'serviceOnline', handler: (serviceId: string, info: ServiceInfo) => void): void;
    on(event: 'serviceOffline', handler: (serviceId: string) => void): void;
    on(event: 'statusChange', handler: (serviceId: string, status: ServiceStatus) => void): void;
    on(event: string, handler: any): void {
        if (event === 'serviceOnline') {
            this.handlers.onServiceOnline = handler;
        } else if (event === 'serviceOffline') {
            this.handlers.onServiceOffline = handler;
        } else if (event === 'statusChange') {
            this.handlers.onServiceStatusChange = handler;
        }
    }

    /**
     * Gets all discovered services.
     */
    getServices(): Map<string, any> {
        return this.services;
    }

    /**
     * Stops discovery.
     */
    stop(): void {
        this.client.end();
        console.log('[Discovery] Stopped');
    }
}

/**
 * Main demo function.
 */
async function main(): Promise<void> {
    console.log('=== Service Registration Demo ===\n');

    const brokerUrl = 'mqtt://localhost:1883';
    const username = 'service';
    const password = 'service123';

    // Create service discovery
    const discovery = new ServiceDiscovery(brokerUrl, username, password);

    discovery.on('serviceOnline', (serviceId, info) => {
        console.log(`[Event] Service online: ${serviceId} (${info.serviceName})`);
    });

    discovery.on('serviceOffline', (serviceId) => {
        console.log(`[Event] Service offline: ${serviceId}`);
    });

    discovery.on('statusChange', (serviceId, status) => {
        console.log(`[Event] Status changed: ${serviceId} -> ${status.status}`);
    });

    await discovery.start();
    console.log();

    // Create and register services
    const service1 = new ServiceRegistry(brokerUrl, username, password, {
        serviceId: 'baggage-handler-001',
        serviceName: 'BaggageHandler',
        version: '1.0.0',
        capabilities: ['process', 'track', 'lookup']
    });

    const service2 = new ServiceRegistry(brokerUrl, username, password, {
        serviceId: 'conveyor-controller-001',
        serviceName: 'ConveyorController',
        version: '2.1.0',
        capabilities: ['start', 'stop', 'speed']
    });

    console.log('--- Registering Services ---\n');

    await service1.register(5000); // 5 second heartbeat
    await new Promise(r => setTimeout(r, 500));
    await service2.register(5000);

    console.log();

    // Wait a bit to collect heartbeats
    await new Promise(r => setTimeout(r, 2000));

    // Show discovered services
    console.log('--- Discovered Services ---');
    for (const [id, service] of discovery.getServices()) {
        console.log(`  ${id}: ${service.info.serviceName} v${service.info.version}`);
        console.log(`    Status: ${service.status.status}`);
        console.log(`    Capabilities: ${service.info.capabilities.join(', ')}`);
    }
    console.log();

    // Simulate status change
    console.log('--- Simulating Status Change ---\n');
    service1.updateStatus('degraded', { cpu: 95, memory: 80 });

    await new Promise(r => setTimeout(r, 1000));

    // Deregister services
    console.log('\n--- Deregistering Services ---\n');
    await service1.deregister();
    await new Promise(r => setTimeout(r, 500));
    await service2.deregister();

    await new Promise(r => setTimeout(r, 1000));

    // Cleanup
    discovery.stop();

    console.log('\n=== Demo Complete ===');
}

// Run if executed directly
main().catch(console.error);
