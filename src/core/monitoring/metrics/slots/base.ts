import { IManageableSlot } from './interface';

/**
 * Gauge slot implementation for metrics.
 * Handles simple value storage and retrieval.
 */
export abstract class BaseSlot implements IManageableSlot {
    /**
     * Gets the current value.
     */
    abstract get value(): number;

    /**
     * Resets the value.
     */
    abstract reset(): void;

    /**
     * Cleanup any resources used by this slot.
     */
    abstract dispose(): void;
}