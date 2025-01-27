/**
 * Unit tests for the PercentSlot class which handles percentage-based metric values.
 * Tests validation, storage, and retrieval of percentage values between 0 and 1.
 */
import { PercentSlot } from '@core/monitoring/metrics/slots/percent';

describe('PercentSlot', () => {
    let slot: PercentSlot;

    beforeEach(() => {
        slot = new PercentSlot();
    });

    /**
     * Tests that the PercentSlot accepts valid percentage values within the range [0,1].
     * Verifies that setting values of 0, 0.5, and 1 does not throw any errors.
     */
    it('should accept valid percentage values', () => {
        expect(() => slot.set(0)).not.toThrow();
        expect(() => slot.set(0.5)).not.toThrow();
        expect(() => slot.set(1)).not.toThrow();
    });

    /**
     * Tests that the PercentSlot rejects invalid percentage values outside the range [0,1].
     * Verifies that attempting to set values less than 0 or greater than 1 throws an error.
     */
    it('should throw error for invalid percentage values', () => {
        expect(() => slot.set(-0.1)).toThrow('Percentage value must be between 0 and 1');
        expect(() => slot.set(1.1)).toThrow('Percentage value must be between 0 and 1');
    });

    /**
     * Tests that the PercentSlot correctly stores and retrieves percentage values.
     * Verifies that values set through set() can be accurately retrieved through value property.
     */
    it('should store and retrieve percentage values correctly', () => {
        slot.set(0.5);
        expect(slot.value).toBe(0.5);

        slot.set(1);
        expect(slot.value).toBe(1);

        slot.set(0);
        expect(slot.value).toBe(0);
    });
});