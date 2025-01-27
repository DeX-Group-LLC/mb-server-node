export enum ConnectionState {
    OPEN = 'open',
    CLOSED = 'closed',
}

export interface Connection {
    serviceId: string; // This will be set by the ConnectionManager
    readonly ip: string;
    get state(): ConnectionState;

    onMessage(listener: (message: Buffer) => void): void;
    onClose(listener: () => void): void;
    send(message: string): void;
    close(): void;
}