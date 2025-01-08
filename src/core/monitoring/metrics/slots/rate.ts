import { ISlotAddable } from './interface';
import { BaseSlot } from './base';

/**
 * Rate slot implementation for metrics.
 * Handles rate tracking with automatic interval reset.
 */
export class RateSlot extends BaseSlot implements ISlotAddable {
    /** Value from the last complete interval */
    private _lastIntervalValue: number = 0;

    /** Current accumulating value in this interval */
    private _currentIntervalValue: number = 0;

    /** Static interval for resetting rate metrics */
    private static rateInterval?: NodeJS.Timeout;

    /** Set of all RateSlot instances */
    private static instances = new Set<RateSlot>();

    /** Initialize the rate interval if not already initialized */
    private static initializeInterval(): void {
        if (!RateSlot.rateInterval) {
            // Reset rate metrics every second
            RateSlot.rateInterval = setInterval(() => {
                for (const slot of RateSlot.instances) {
                    // Store the current interval's value before reset
                    slot._lastIntervalValue = slot._currentIntervalValue;
                    slot._currentIntervalValue = 0;
                }
            }, 1000);
            // Ensure cleanup on exit
            process.once('exit', RateSlot.cleanup);
        }
    }

    constructor() {
        super();
        RateSlot.instances.add(this);
        RateSlot.initializeInterval();
    }

    /**
     * Adds to the current interval value.
     */
    add(value: number): void {
        this._currentIntervalValue += value;
    }

    /**
     * Gets the last complete interval's value.
     */
    get value(): number {
        return this._lastIntervalValue;
    }

    /**
     * Gets the current accumulating value for this interval.
     */
    get accumulatedValue(): number {
        return this._currentIntervalValue;
    }

    /**
     * Resets all values to 0.
     */
    reset(): void {
        this._lastIntervalValue = 0;
        this._currentIntervalValue = 0;
    }

    /**
     * Removes this slot from the active set and cleans up.
     */
    dispose(): void {
        RateSlot.instances.delete(this);
        // If this was the last instance, clean up the interval
        if (RateSlot.instances.size === 0) {
            RateSlot.cleanup();
        }
    }

    /**
     * Cleanup static interval when process exits
     */
    static cleanup(): void {
        if (RateSlot.rateInterval) {
            clearInterval(RateSlot.rateInterval);
            RateSlot.rateInterval = undefined;
            // Dispose of all instances
            for (const slot of RateSlot.instances) {
                slot.dispose();
            }
        }
        RateSlot.instances.clear();
    }
}