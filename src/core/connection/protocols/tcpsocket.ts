import { Socket } from 'net';
import { SetupLogger } from '@utils/logger';
import { InternalError } from '@core/errors';
import { Connection, ConnectionState } from '../types';
import { config } from '@config';
import { MAX_HEADER_LENGTH } from '@core/utils/message';

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
        private socket: Socket,
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
            if (this.messageListener) {
                this.messageListener(message);
            }

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
        }
    }
}