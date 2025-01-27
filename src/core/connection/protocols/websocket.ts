import { WebSocket } from 'ws';
import { InternalError } from '@core/errors';
import { SetupLogger } from '@utils/logger';
import { Connection, ConnectionState } from '../types';

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