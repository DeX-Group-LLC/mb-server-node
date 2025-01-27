import fs from 'fs';
import { IncomingMessage } from 'http';
import { Server, Socket, createServer as createTcpServer } from 'net';
import { createServer as createTlsServer } from 'tls';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '@config';
import { SetupLogger } from '@utils/logger';
import { ConnectionManager } from '../manager';
import { TCPSocketConnection } from './tcpsocket';
import { WebSocketConnection } from './websocket';
import { MAX_HEADER_LENGTH } from '@core/utils/message';

const logger = SetupLogger('CombinedServer');

export interface CombinedServer {
    server: Server;
    webSocketServer: WebSocketServer;
    close(): Promise<void>;
}

/**
 * Creates a combined server that supports both TCP and WebSocket connections on the same port.
 * For WebSocket connections, it detects the HTTP upgrade request and handles it appropriately.
 * For TCP connections, it passes them through directly.
 *
 * @param connectionManager - The connection manager instance to handle new connections
 * @returns A CombinedServer instance that handles both TCP and WebSocket connections
 */
export function createCombinedServer(connectionManager: ConnectionManager): CombinedServer {
    const isTls = config.ssl && config.ssl.key && config.ssl.cert;
    // Create the base server (TCP or TLS)
    const server = isTls
        ? createTlsServer({
            key: fs.readFileSync(config.ssl!.key!),
            cert: fs.readFileSync(config.ssl!.cert!),
            // Add proper TLS error handling
            //handshakeTimeout: 5000, // 5 seconds timeout for handshake
        })
        : createTcpServer();

    // Add specific TLS error handling
    if (config.ssl && config.ssl.key && config.ssl.cert) {
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

    // Create WebSocket server without a dedicated HTTP server
    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: config.message.payload.maxLength + MAX_HEADER_LENGTH // TODO: How to handle payload vs header length?
    });

    // Handle WebSocket connections
    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const ip = req.socket.remoteAddress || 'unknown';
        logger.info(`Client connected (WebSocket) from IP ${ip}`);

        const connection = new WebSocketConnection(ws, ip);
        connectionManager.addConnection(connection);

        ws.on('error', (error: Error) => {
            logger.error(`WebSocket error from service ${connection.serviceId} (IP ${ip}):`, {
                serviceId: connection.serviceId,
                error
            });
            connectionManager.removeConnection(connection.serviceId);
        });
    });

    // Handle incoming connections
    server.on(isTls ? 'secureConnection' : 'connection', (socket: Socket) => {
        let isWebSocket = false;
        let buffer = Buffer.alloc(0);

        // Handle initial data to detect protocol
        socket.once('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            // Check if it's a WebSocket upgrade request
            const data = buffer.toString();
            if (data.includes('GET') && data.includes('Upgrade: websocket')) {
                isWebSocket = true;

                // Handle WebSocket upgrade
                const key = data.match(/Sec-WebSocket-Key: (.+)\r\n/)?.[1];
                if (!key) {
                    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                    return;
                }

                // Create a mock request object
                const headers: { [key: string]: string } = {};
                const headerLines = data.split('\r\n');

                // Parse all headers from the request
                for (const line of headerLines) {
                    const match = line.match(/^([^:]+):\s*(.+)/);
                    if (match) {
                        headers[match[1].toLowerCase()] = match[2];
                    }
                }

                // Parse the request line
                const [method, path, httpVersion] = headerLines[0].split(' ');

                // Create a proper request object
                const req = Object.assign(new IncomingMessage(socket), {
                    method,
                    url: path,
                    headers,
                    httpVersion: httpVersion.replace('HTTP/', ''),
                    socket
                });

                // Emit upgrade event for WebSocket handling
                wss.handleUpgrade(req, socket, Buffer.alloc(0), (ws) => {
                    wss.emit('connection', ws, req);
                });
            } else {
                // Handle as TCP connection
                socket.unshift(buffer); // Put the data back
                handleTcpConnection(socket, connectionManager);
            }
        });

        // Handle connection timeout
        socket.setTimeout(config.connection.heartbeatDeregisterTimeout + 1000);
        socket.on('timeout', () => {
            if (!isWebSocket) {
                socket.end();
            }
        });

        // Handle errors
        socket.on('error', (error: Error) => {
            logger.error('Socket error:', error);
            socket.destroy();
        });
    });

    // Handle server errors
    server.on('error', (error: Error) => {
        logger.error('Server error:', error);
    });

    wss.on('error', (error: Error) => {
        logger.error('WebSocket server error:', error);
    });

    // Start listening
    server.listen(config.port, config.host, () => {
        logger.info(`Listening on ${config.host}:${config.port} (TCP/WebSocket${config.ssl ? ' with SSL' : ''})`);
    });

    return {
        server,
        webSocketServer: wss,
        async close(): Promise<void> {
            // Close all WebSocket connections
            for (const client of wss.clients) {
                client.terminate();
            }

            const promises = [];

            // Close the WebSocket server
            promises.push(new Promise<void>((resolve) => {
                wss.close((err) => {
                    if (err) logger.error('Error closing WebSocket server:', err);
                    resolve();
                });
            }));

            // Close the main server
            promises.push(new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        logger.error('Error closing server:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }));

            // Wait for all promises to resolve
            await Promise.all(promises);
            logger.info('All servers closed successfully');
        }
    };
}

/**
 * Handles new TCP connections.
 *
 * @param socket - The TCP socket
 * @param connectionManager - The connection manager instance
 */
function handleTcpConnection(socket: Socket, connectionManager: ConnectionManager): void {
    const ip = socket.remoteAddress || 'unknown';
    logger.info(`Client connected (TCP) from IP ${ip}`);

    const connection = new TCPSocketConnection(socket, ip);
    connectionManager.addConnection(connection);

    socket.on('error', (error: Error) => {
        logger.error(`TCP error from service ${connection.serviceId} (IP ${ip}):`, {
            serviceId: connection.serviceId,
            error
        });
        connectionManager.removeConnection(connection.serviceId);
    });
}