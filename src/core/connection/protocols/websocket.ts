import fs from 'fs';
import http from 'http';
import https from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '@config';
import { InternalError } from '@core/errors';
import { SetupLogger} from '@utils/logger';
import { ConnectionManager } from '../manager';
import { Connection, ConnectionState } from '../types';
import { MAX_HEADER_LENGTH } from '@core/utils/message';

const logger = SetupLogger('WebSocketConnection');

export class WebSocketConnection implements Connection {
    serviceId!: string; // This will be set by the ConnectionManager

    constructor(private ws: WebSocket, public readonly ip: string) {}

    get state(): ConnectionState {
        return this.ws.readyState === WebSocket.OPEN ? ConnectionState.OPEN : ConnectionState.CLOSED;
    }

    onMessage(listener: (message: Buffer) => void): void {
        this.ws.on('message', (buffer: Buffer) => {
            listener(buffer);
        });
    }

    onClose(listener: () => void): void {
        this.ws.on('close', listener);
    }

    send(message: string): void {
        if (this.state === ConnectionState.OPEN) {
            this.ws.send(message);
        } else {
            logger.warn(`Unable to send message to service ${this.serviceId}: Connection is not open`);
            throw new InternalError('Desired service connection is not open');
        }
    }

    close(): void {
        if (this.state === ConnectionState.OPEN) {
            this.ws.close();
        }
    }
}

/**
 * Creates and configures WebSocket server(s) for handling incoming
 * WebSocket connections. Can create both secure and unsecure servers
 * based on configuration.
 *
 * @param connectionManager The ConnectionManager instance to use for managing connections.
 * @returns Array of configured WebSocket servers.
 */
export function createWebSocketServer(connectionManager: ConnectionManager): WebSocketServer[] {
    const servers: WebSocketServer[] = [];

    // Create secure WebSocket server if SSL is configured
    if (config.ssl && config.ssl.key && config.ssl.cert) {
        logger.debug('Creating secure WebSocket server (WSS)');
        const secureServer = https.createServer({
            key: fs.readFileSync(config.ssl.key),
            cert: fs.readFileSync(config.ssl.cert)
        });

        secureServer.listen(config.ports.wss, config.host, () => {
            logger.info(`Secure WebSocket server listening on ${config.host}:${config.ports.wss}`);
        });

        const wss = new WebSocketServer({
            server: secureServer,
            maxPayload: config.message.payload.maxLength + MAX_HEADER_LENGTH
        });
        setupWebSocketHandlers(wss, connectionManager);
        servers.push(wss);
    } else {
        logger.warn('SSL configuration is missing, secure WebSocket server (WSS) will not be started');
    }

    // Create unsecure WebSocket server if explicitly enabled
    if (config.allowUnsecure) {
        logger.debug('Creating unsecure WebSocket server (WS) - explicitly enabled in config');
        const unsecureServer = http.createServer();

        unsecureServer.listen(config.ports.ws, config.host, () => {
            logger.info(`Unsecure WebSocket server listening on ${config.host}:${config.ports.ws}`);
        });

        const ws = new WebSocketServer({
            server: unsecureServer,
            maxPayload: config.message.payload.maxLength + MAX_HEADER_LENGTH
        });
        setupWebSocketHandlers(ws, connectionManager);
        servers.push(ws);
    } else {
        logger.debug('Unsecure WebSocket server (WS) is disabled');
    }

    if (servers.length === 0) {
        throw new InternalError('No WebSocket servers could be started. Check SSL configuration or enable unsecure WebSocket.');
    }

    return servers;
}

/**
 * Sets up the connection and error handlers for a WebSocket server
 *
 * @param wss The WebSocket server to configure
 * @param connectionManager The connection manager to use
 */
function setupWebSocketHandlers(wss: WebSocketServer, connectionManager: ConnectionManager): void {
    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        const ip = req.socket.remoteAddress || 'unknown';
        logger.info(`Client connected (WebSocket) from IP ${ip}`);

        // Generate a unique service ID for this connection
        const connection = new WebSocketConnection(ws, ip);

        // Add the connection to the ConnectionManager
        connectionManager.addConnection(connection);

        ws.on('error', (error: Error) => {
            logger.error(`WebSocket error from service ${connection.serviceId} (IP ${ip}):`, { serviceId: connection.serviceId, error });
            connectionManager.removeConnection(connection.serviceId);
        });
    });

    wss.on('error', (error: Error) => {
        logger.error('WebSocket server error:', error);
    });
}