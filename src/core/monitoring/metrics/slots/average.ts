import { BaseSlot } from './base';
import { ISlotAddable } from './interface';

/**
 * Average slot implementation for metrics.
 * Tracks a running average of values.
 */
export class AverageSlot extends BaseSlot implements ISlotAddable {
    private _sum: number = 0;
    private _count: number = 0;

    /**
     * Gets the current average value.
     */
    get value(): number {
        return this._count === 0 ? 0 : this._sum / this._count;
    }

    /**
     * Adds a value to the average calculation.
     * @param value - The value to add
     */
    add(value: number): void {
        this._sum += value;
        this._count++;
        this._lastModified = new Date();
    }

    /**
     * Resets the average calculation.
     */
    reset(): void {
        this._sum = 0;
        this._count = 0;
        this._lastModified = new Date();
    }

    /**
     * Cleanup resources.
     */
    dispose(): void {
        this.reset();
    }
}