import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

describe('Config', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.resetAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console.error
        (console.error as jest.Mock).mockRestore();
    });

    it('should throw error when config file cannot be read', () => {
        // Mock fs.readFileSync to throw an error
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('File not found');
        });

        // Mock path.join to return a test path
        (path.join as jest.Mock).mockReturnValue('/test/path/config.yaml');

        // Load config module
        expect(() => {
            const { loadConfig } = require('@config');
        }).toThrow('File not found');

        // Verify error is thrown and logged
        expect(console.error).toHaveBeenCalledWith(
            'Error loading configuration:',
            expect.any(Error)
        );
    });

    it('should throw error when config file is invalid YAML', () => {
        // Mock fs.readFileSync to return invalid YAML
        (fs.readFileSync as jest.Mock).mockReturnValue('invalid: yaml: content: {');

        // Mock path.join to return a test path
        (path.join as jest.Mock).mockReturnValue('/test/path/config.yaml');

        // Load config module
        expect(() => {
            const { loadConfig } = require('@config');
        }).toThrow('bad indentation of a mapping entry');

        // Verify error is thrown and logged
        expect(console.error).toHaveBeenCalledWith(
            'Error loading configuration:',
            expect.any(Error)
        );
    });

    it('should load default config and apply environment variable overrides', () => {
        // Mock default config YAML
        const mockConfig = {
            ports: {
                websocket: 8080,
                tcp: 8081
            },
            host: 'localhost',
            logging: {
                level: 'info',
                format: 'json'
            },
            auth: {
                failure: {
                    lockout: {
                        threshold: 5,
                        duration: 300
                    }
                }
            },
            rate: {
                limit: {
                    global: {
                        per: {
                            service: 1000,
                            topic: 100
                        }
                    }
                }
            },
            connection: {
                max: {
                    concurrent: 1000
                },
                heartbeatRetryTimeout: 5000,
                heartbeatDeregisterTimeout: 30000
            },
            request: {
                response: {
                    timeout: {
                        default: 30000,
                        max: 60000
                    }
                }
            },
            max: {
                outstanding: {
                    requests: 100
                }
            },
            message: {
                payload: {
                    maxLength: 1048576 // 1MB
                }
            },
            monitoring: {
                interval: 5000
            },
            ssl: {} // Add empty SSL object to match default config
        };

        // Mock fs.readFileSync to return valid YAML
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

        // Set environment variables
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            WS_PORT: '9090',
            WSS_PORT: '9443',
            TCP_PORT: '9091',
            TLS_PORT: '9444',
            HOST: 'test-host',
            ALLOW_UNSECURE: 'true',
            AUTH_FAILURE_LOCKOUT_THRESHOLD: '10',
            AUTH_FAILURE_LOCKOUT_DURATION: '600',
            RATE_LIMIT_GLOBAL_PER_SERVICE: '2000',
            RATE_LIMIT_GLOBAL_PER_TOPIC: '200',
            CONNECTION_MAX_CONCURRENT: '2000',
            REQUEST_RESPONSE_TIMEOUT_DEFAULT: '45000',
            REQUEST_RESPONSE_TIMEOUT_MAX: '90000',
            MAX_OUTSTANDING_REQUESTS: '200',
            SSL_KEY: '/path/to/key.pem',
            SSL_CERT: '/path/to/cert.pem'
        };

        // Load config module
        const { loadConfig } = require('@config');

        // Load config with environment overrides
        const config = loadConfig('/test/path/config.yaml');

        // Verify environment variables override default values
        expect(config.ports.ws).toBe(9090);
        expect(config.ports.wss).toBe(9443);
        expect(config.ports.tcp).toBe(9091);
        expect(config.ports.tls).toBe(9444);
        expect(config.host).toBe('test-host');
        expect(config.auth.failure.lockout.threshold).toBe(10);
        expect(config.auth.failure.lockout.duration).toBe(600);
        expect(config.rate.limit.global.per.service).toBe(2000);
        expect(config.rate.limit.global.per.topic).toBe(200);
        expect(config.connection.max.concurrent).toBe(2000);
        expect(config.request.response.timeout.default).toBe(45000);
        expect(config.request.response.timeout.max).toBe(90000);
        expect(config.max.outstanding.requests).toBe(200);
        expect(config.ssl.key).toBe('/path/to/key.pem');
        expect(config.ssl.cert).toBe('/path/to/cert.pem');

        // Restore original environment
        process.env = originalEnv;
    });
});