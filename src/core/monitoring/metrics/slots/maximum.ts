import { BaseSlot } from './base';
import { ISlotAddable } from './interface';
/**
 * Maximum slot implementation for metrics.
 * Tracks the maximum value seen.
 */
export class MaximumSlot extends BaseSlot implements ISlotAddable {
    private _value: number = Number.NEGATIVE_INFINITY;

    /**
     * Gets the current maximum value.
     */
    get value(): number {
        return this._value === Number.NEGATIVE_INFINITY ? 0 : this._value;
    }

    /**
     * Updates the maximum value if the new value is larger.
     * @param value - The value to compare against the current maximum
     */
    add(value: number): void {
        if (value > this._value) {
            this._value = value;
            this._lastModified = new Date();
        }
    }

    /**
     * Resets the maximum value.
     */
    reset(): void {
        this._value = Number.NEGATIVE_INFINITY;
        this._lastModified = new Date();
    }

    /**
     * Cleanup resources.
     */
    dispose(): void {
        this.reset();
    }
}