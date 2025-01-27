import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { Config } from './types';

// Load environment variables from .env file (if it exists)
dotenv.config();

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'default.yaml');

/**
 * Loads the configuration from the specified YAML file and applies
 * environment variable overrides.
 *
 * @param configPath - The path to the YAML configuration file.
 * @returns The configuration object.
 */
export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH): Config {
    try {
        // Load and parse the YAML configuration file.
        const configFile = fs.readFileSync(configPath, 'utf-8');
        const config = yaml.load(configFile) as Config;

        // Override with environment variables (if set).
        if (process.env.WEBSOCKET_PORT) config.ports.websocket = parseInt(process.env.WEBSOCKET_PORT, 10);
        if (process.env.TCP_PORT) config.ports.tcp = parseInt(process.env.TCP_PORT, 10);
        if (process.env.HOST) config.host = process.env.HOST;
        if (process.env.SSL_KEY && process.env.SSL_CERT) {
            config.ssl = {
                key: process.env.SSL_KEY,
                cert: process.env.SSL_CERT
            };
        }
        if (process.env.AUTH_FAILURE_LOCKOUT_THRESHOLD) config.auth.failure.lockout.threshold = parseInt(process.env.AUTH_FAILURE_LOCKOUT_THRESHOLD, 10);
        if (process.env.AUTH_FAILURE_LOCKOUT_THRESHOLD) config.auth.failure.lockout.threshold = parseInt(process.env.AUTH_FAILURE_LOCKOUT_THRESHOLD, 10);
        if (process.env.AUTH_FAILURE_LOCKOUT_DURATION) config.auth.failure.lockout.duration = parseInt(process.env.AUTH_FAILURE_LOCKOUT_DURATION, 10);
        if (process.env.RATE_LIMIT_GLOBAL_PER_SERVICE) config.rate.limit.global.per.service = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_SERVICE, 10);
        if (process.env.RATE_LIMIT_GLOBAL_PER_TOPIC) config.rate.limit.global.per.topic = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_TOPIC, 10);
        if (process.env.CONNECTION_MAX_CONCURRENT) config.connection.max.concurrent = parseInt(process.env.CONNECTION_MAX_CONCURRENT, 10);
        if (process.env.REQUEST_RESPONSE_TIMEOUT_DEFAULT) config.request.response.timeout.default = parseInt(process.env.REQUEST_RESPONSE_TIMEOUT_DEFAULT, 10);
        if (process.env.REQUEST_RESPONSE_TIMEOUT_MAX) config.request.response.timeout.max = parseInt(process.env.REQUEST_RESPONSE_TIMEOUT_MAX, 10);
        if (process.env.MAX_OUTSTANDING_REQUESTS) config.max.outstanding.requests = parseInt(process.env.MAX_OUTSTANDING_REQUESTS, 10);

        return config;
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw error; // Or return a default configuration object
    }
}

// Export the loaded configuration as a singleton.
export const config = loadConfig();