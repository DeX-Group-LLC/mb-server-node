import { IManageableSlot } from './interface';

/**
 * Gauge slot implementation for metrics.
 * Handles simple value storage and retrieval.
 */
export abstract class BaseSlot implements IManageableSlot {
    protected _lastModified: Date = new Date();

    /**
     * Gets the current value.
     */
    abstract get value(): number;

    /**
     * Gets the last modified time.
     */
    get lastModified(): Date {
        return this._lastModified;
    }

    /**
     * Resets the value.
     */
    abstract reset(): void;

    /**
     * Cleanup any resources used by this slot.
     */
    abstract dispose(): void;
}