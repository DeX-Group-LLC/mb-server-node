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
 * Creates and configures a WebSocket server for handling incoming
 * WebSocket connections.
 *
 * @param messageRouter The MessageRouter instance to use for routing messages.
 * @param connectionManager The ConnectionManager instance to use for managing connections.
 * @returns The configured WebSocket server.
 */
export function createWebSocketServer(connectionManager: ConnectionManager): WebSocketServer {
    let server: http.Server;
    if (config.ssl && config.ssl.key && config.ssl.cert) {
        logger.debug('SSL is enabled');
        const key = fs.readFileSync(config.ssl.key);
        const cert = fs.readFileSync(config.ssl.cert);
        server = https.createServer({ key, cert });
    } else {
        logger.debug('SSL is disabled');
        server = http.createServer();
    }

    server.listen(config.ports.websocket, () => {
        logger.info(`WebSocket server listening on ${config.host}:${config.ports.websocket}${config.ssl ? ' with SSL' : ''}`);
    });

    const wss = new WebSocketServer({ server, maxPayload: config.message.payload.maxLength + MAX_HEADER_LENGTH });

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

    return wss;
}