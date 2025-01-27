import { ISlotAddable, ISlotSettable } from './interface';
import { BaseSlot } from './base';

/**
 * Gauge slot implementation for metrics.
 * Handles simple value storage and retrieval.
 */
export class GaugeSlot extends BaseSlot implements ISlotAddable, ISlotSettable {
    private _value: number = 0;

    /**
     * Sets the current value.
     */
    set(value: number): void {
        this._value = value;
        this._lastModified = new Date();
    }

    /**
     * Adds a value to the current value.
     */
    add(value: number): void {
        this._value += value;
        this._lastModified = new Date();
    }

    /**
     * Gets the current value.
     */
    get value(): number {
        return this._value;
    }

    /**
     * Resets the value to 0.
     */
    reset(): void {
        this._value = 0;
        this._lastModified = new Date();
    }

    /**
     * Cleanup any resources used by this slot.
     */
    dispose(): void {
        // Gauge slot has no resources to clean up
    }
}