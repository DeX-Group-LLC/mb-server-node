import { ActionType } from '@core/types';

export interface Header {
    action: ActionType;
    topic: string;
    version: string;
    requestid?: string;
}

export interface Error {
    code: string;
    message: string;
    timestamp: string; // ISO 8601 format (e.g., "2023-10-27T10:30:00Z")
    details?: object;
}


export interface Payload {
    timeout?: number;
    error?: Error;
    [key: string]: any; // Allow other fields in the payload
}

export interface Message {
    header: Header;
    payload: Payload;
}