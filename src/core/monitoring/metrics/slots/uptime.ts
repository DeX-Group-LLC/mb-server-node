import { ISlotSettable } from './interface';
import { BaseSlot } from './base';

/**
 * Uptime slot implementation for metrics.
 * Tracks uptime in seconds based on a start date.
 */
export class UptimeSlot extends BaseSlot implements ISlotSettable<Date> {
    private _startTime: Date = new Date();
    private _disposed: boolean = false;

    /**
     * Sets the start time for uptime tracking.
     * @param value - The start time as a Date object
     */
    set(value: Date): void {
        this._startTime = value;
        this._lastModified = new Date();
    }

    /**
     * Gets the current uptime in seconds.
     * Returns:
     * - 0 if disposed
     * - 0 if start time is in the future
     * - Elapsed seconds since start time otherwise
     */
    get value(): number {
        if (this._disposed) return 0;

        const now = new Date();
        const elapsed = Math.floor((now.getTime() - this._startTime.getTime()) / 1000);
        return Math.max(0, elapsed);
    }

    /**
     * Resets the uptime tracking by setting start time to now.
     */
    reset(): void {
        this._startTime = new Date();
        this._lastModified = new Date();
    }

    /**
     * Cleanup any resources used by this slot.
     * Stops time tracking.
     */
    dispose(): void {
        this._disposed = true;
    }
}