import fs from 'fs';
import net from 'net';
import tls from 'tls';
import { SetupLogger } from '@utils/logger';
import { InternalError } from '@core/errors';
import { Connection, ConnectionState } from '../types';
import { config } from '@config';
import { MAX_HEADER_LENGTH } from '@core/utils/message';
import { ConnectionManager } from '../manager';

const logger = SetupLogger('TCPSocketConnection');

/**
 * Frame format:
 * [4 bytes length][payload]
 * Length is in network byte order (big endian)
 */
export class TCPSocketConnection implements Connection {
    serviceId!: string; // This will be set by the ConnectionManager
    private isConnected: boolean = true;
    private messageListener?: (message: Buffer) => void;
    private closeListener?: () => void;
    private buffer: Buffer = Buffer.alloc(0);
    private expectedLength: number = -1;

    constructor(
        private socket: net.Socket,
        public readonly ip: string
    ) {
        this.setupSocketListeners();
    }

    private setupSocketListeners(): void {
        this.socket.on('data', (data: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, data]);
            this.processBuffer();
        });

        this.socket.on('close', () => {
            this.isConnected = false;
            if (this.closeListener) {
                this.closeListener();
            }
        });

        this.socket.on('error', (error: Error) => {
            logger.error(`Socket error from service ${this.serviceId} (IP ${this.ip}):`, { serviceId: this.serviceId, error });
            this.close();
        });
    }

    private processBuffer(): void {
        while (true) {
            // If we don't have a length yet, try to read it
            if (this.expectedLength === -1) {
                if (this.buffer.length < 4) return; // Need more data
                this.expectedLength = this.buffer.readUInt32BE(0);
                this.buffer = this.buffer.subarray(4);
            }

            if (this.expectedLength > config.message.payload.maxLength + MAX_HEADER_LENGTH) { // TODO: How to handle payload vs header length?
                logger.error(`Received message with length ${this.expectedLength} which exceeds the maximum allowed size of ${config.message.payload.maxLength}`);
                this.close();
                return;
            }

            // Check if we have enough data for the complete message
            if (this.buffer.length < this.expectedLength) return; // Need more data

            // Extract the message
            const message = this.buffer.subarray(0, this.expectedLength);
            this.buffer = this.buffer.subarray(this.expectedLength);
            this.expectedLength = -1;

            // Emit the message
            this.messageListener?.(message);

            // If no more data to process, break
            if (this.buffer.length < 4) break;
        }
    }

    get state(): ConnectionState {
        return this.isConnected ? ConnectionState.OPEN : ConnectionState.CLOSED;
    }

    onMessage(listener: (message: Buffer) => void): void {
        this.messageListener = listener;
    }

    onClose(listener: () => void): void {
        this.closeListener = listener;
    }

    send(message: string): void {
        if (this.state === ConnectionState.OPEN) {
            const messageBuffer = Buffer.from(message);
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(messageBuffer.length);
            this.socket.write(Buffer.concat([lengthBuffer, messageBuffer]));
        } else {
            logger.warn(`Unable to send message to service ${this.serviceId}: Connection is not open`);
            throw new InternalError('Desired service connection is not open');
        }
    }

    close(): void {
        if (this.state === ConnectionState.OPEN) {
            this.socket.end();
            this.isConnected = false;
            this.closeListener?.();
        }
    }
}

/**
 * Creates TCP server(s) that listen on dedicated ports.
 * Can create both secure (TLS) and unsecure servers based on configuration.
 *
 * @param connectionManager - The connection manager instance to handle new connections
 * @returns Array of TCP server instances
 */
export function createTcpServer(connectionManager: ConnectionManager): net.Server[] {
    const servers: net.Server[] = [];

    // Create secure (TLS) server if SSL is configured
    if (config.ssl && config.ssl.key && config.ssl.cert) {
        logger.debug('Creating secure TCP server (TLS)');
        const secureServer = tls.createServer({
            key: fs.readFileSync(config.ssl.key),
            cert: fs.readFileSync(config.ssl.cert),
            handshakeTimeout: 5000, // 5 seconds timeout for handshake
            minVersion: 'TLSv1.2',
        });

        setupTcpServerHandlers(secureServer, connectionManager, true);

        // Start listening
        secureServer.listen(config.ports.tls, config.host, () => {
            logger.info(`Secure TCP server (TLS) listening on ${config.host}:${config.ports.tls}`);
        });

        servers.push(secureServer);
    } else {
        logger.warn('SSL configuration is missing, secure TCP server (TLS) will not be started');
    }

    // Create unsecure TCP server if explicitly enabled
    if (config.allowUnsecure) {
        logger.debug('Creating unsecure TCP server - explicitly enabled in config');
        const unsecureServer = net.createServer();

        setupTcpServerHandlers(unsecureServer, connectionManager, false);

        // Start listening
        unsecureServer.listen(config.ports.tcp, config.host, () => {
            logger.info(`Unsecure TCP server listening on ${config.host}:${config.ports.tcp}`);
        });

        servers.push(unsecureServer);
    } else {
        logger.debug('Unsecure TCP server is disabled');
    }

    if (servers.length === 0) {
        throw new InternalError('No TCP servers could be started. Check SSL configuration or enable unsecure TCP.');
    }

    return servers;
}

/**
 * Sets up the handlers for a TCP server
 *
 * @param server - The TCP server to configure
 * @param connectionManager - The connection manager instance
 * @param isTls - Whether this is a TLS server
 */
function setupTcpServerHandlers(server: net.Server, connectionManager: ConnectionManager, isTls: boolean): void {
    // Add specific TLS error handling for secure servers
    if (isTls) {
        server.on('tlsClientError', (err, tlsSocket) => {
            const ip = tlsSocket.remoteAddress || 'unknown';
            if (err.code === 'ECONNRESET') {
                logger.debug(`TLS handshake aborted by client (IP ${ip})`);
            } else {
                logger.error(`TLS error with client (IP ${ip}):`, err);
            }
            tlsSocket.destroy();
        });
    }

    // Handle incoming connections
    server.on(isTls ? 'secureConnection' : 'connection', (socket: net.Socket) => {
        const ip = socket.remoteAddress || 'unknown';
        logger.info(`Client connected (TCP${isTls ? '/TLS' : ''}) from IP ${ip}`);

        const connection = new TCPSocketConnection(socket, ip);
        connectionManager.addConnection(connection);

        socket.on('error', (error: Error) => {
            logger.error(`TCP${isTls ? '/TLS' : ''} error from service ${connection.serviceId} (IP ${ip}):`, {
                serviceId: connection.serviceId,
                error
            });
            connectionManager.removeConnection(connection.serviceId);
        });

        // Handle connection timeout
        socket.setTimeout(config.connection.heartbeatDeregisterTimeout + 1000);
        socket.on('timeout', () => {
            socket.end();
        });
    });

    // Handle server errors
    server.on('error', (error: Error) => {
        logger.error(`TCP${isTls ? '/TLS' : ''} server error:`, error);
    });
}