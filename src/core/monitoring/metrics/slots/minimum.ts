import { BaseSlot } from './base';
import { ISlotAddable } from './interface';
/**
 * Minimum slot implementation for metrics.
 * Tracks the minimum value seen.
 */
export class MinimumSlot extends BaseSlot implements ISlotAddable {
    private _value: number = Number.POSITIVE_INFINITY;

    /**
     * Gets the current minimum value.
     */
    get value(): number {
        return this._value === Number.POSITIVE_INFINITY ? 0 : this._value;
    }

    /**
     * Updates the minimum value if the new value is smaller.
     * @param value - The value to compare against the current minimum
     */
    add(value: number): void {
        if (value < this._value) {
            this._value = value;
            this._lastModified = new Date();
        }
    }

    /**
     * Resets the minimum value.
     */
    reset(): void {
        this._value = Number.POSITIVE_INFINITY;
        this._lastModified = new Date();
    }

    /**
     * Cleanup resources.
     */
    dispose(): void {
        this.reset();
    }
}