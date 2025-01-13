import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '@config';
import { InternalError } from '@core/errors';
import { SetupLogger} from '@utils/logger';
import { ConnectionManager } from './manager';
import { Connection, ConnectionState } from './types';

const logger = SetupLogger('WebSocketConnection');

export class WebSocketConnection implements Connection {
    serviceId!: string; // This will be set by the ConnectionManager

    constructor(private ws: WebSocket, public readonly ip: string) {}

    get state(): ConnectionState {
        return this.ws.readyState === WebSocket.OPEN ? ConnectionState.OPEN : ConnectionState.CLOSED;
    }

    onMessage(listener: (message: string) => void): void {
        this.ws.on('message', (buffer: Buffer) => {
            listener(buffer.toString());
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
    const wss = new WebSocketServer({ port: config.port, maxPayload: config.message.payload.maxLength + 512 });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
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