/**
 * Represents the configuration for the Message Broker.
 */
export interface Config {
    port: number;
    host: string;
    ssl: {
        key?: string;
        cert?: string;
    };
    logging: {
        level: string;
        format: string;
    };
    // ... other configuration parameters as needed
    auth: {
        failure: {
            lockout: {
                threshold: number;
                duration: number;
            }
        }
    },
    rate: {
        limit: {
            global: {
                per: {
                    service: number;
                    topic: number;
                }
            },
            topic: {
                per: {
                    service: {
                        [key: string]: number // Allows for dynamic keys based on topic names
                    }
                }
            }
        }
    }
    connection: {
        max: {
            concurrent: number;
        }
        heartbeatRetryTimeout: number;
        heartbeatDeregisterTimeout: number;
    }
    request: {
        response: {
            timeout: {
                default: number;
                max: number;
            }
        }
    },
    max: {
        outstanding: {
            requests: number;
        }
    },
    message: {
        payload: {
            maxLength: number;
        }
    },
    monitoring: {
        interval: number;
    }
}