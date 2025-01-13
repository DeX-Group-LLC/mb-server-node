import { GaugeSlot } from './gauge';

/**
 * A slot for tracking percentage values between 0 and 1
 */
export class PercentSlot extends GaugeSlot {
    /**
     * Set the current percentage value (0-1)
     * @param value The percentage value between 0 and 1
     * @throws {Error} If value is not between 0 and 1
     */
    set(value: number): void {
        if (value < 0 || value > 1) {
            throw new Error(`Percentage value must be between 0 and 1, got ${value}`);
        }
        super.set(value);
    }
}