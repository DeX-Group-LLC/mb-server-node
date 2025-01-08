import { GaugeSlot } from '@core/monitoring/metrics/slots/gauge';

/**
 * Test suite for GaugeSlot.
 * GaugeSlot is a simple metric slot that stores a single value that can be:
 * - Set directly (replacing the current value)
 * - Incremented/decremented via add()
 * - Reset to zero
 *
 * It implements ISlotSettable and ISlotAddable interfaces.
 */
describe('GaugeSlot', () => {
    let slot: GaugeSlot;

    beforeEach(() => {
        // Create a fresh slot for each test
        slot = new GaugeSlot();
    });

    /**
     * Tests for initial state and basic value management
     */
    describe('value management', () => {
        /**
         * Verifies that a new GaugeSlot starts with zero value
         */
        it('should initialize with value 0', () => {
            expect(slot.value).toBe(0);
        });

        /**
         * Verifies that the set() method correctly updates the value
         */
        it('should set value correctly', () => {
            // Set positive value
            slot.set(5);
            expect(slot.value).toBe(5);

            // Set negative value
            slot.set(-3);
            expect(slot.value).toBe(-3);

            // Set zero
            slot.set(0);
            expect(slot.value).toBe(0);
        });

        /**
         * Verifies that the add() method correctly updates the value
         */
        it('should add to value correctly', () => {
            // Add positive value
            slot.add(5);
            expect(slot.value).toBe(5);

            // Add another positive value
            slot.add(3);
            expect(slot.value).toBe(8);

            // Add negative value (should subtract)
            slot.add(-4);
            expect(slot.value).toBe(4);
        });

        /**
         * Verifies that floating point values are handled correctly
         */
        it('should handle floating point values', () => {
            slot.set(1.5);
            expect(slot.value).toBe(1.5);

            slot.add(2.7);
            expect(slot.value).toBe(4.2);
        });
    });

    /**
     * Tests for reset functionality
     */
    describe('reset', () => {
        /**
         * Verifies that reset() properly clears the value
         */
        it('should reset value to 0', () => {
            // Set a non-zero value
            slot.set(5);
            expect(slot.value).toBe(5);

            // Reset should clear the value
            slot.reset();
            expect(slot.value).toBe(0);
        });

        /**
         * Verifies that reset() works after multiple operations
         */
        it('should reset after multiple operations', () => {
            slot.set(5);
            slot.add(3);
            slot.add(-2);
            expect(slot.value).toBe(6);

            slot.reset();
            expect(slot.value).toBe(0);
        });
    });

    /**
     * Tests for disposal
     */
    describe('dispose', () => {
        /**
         * Verifies that dispose() can be called without errors
         */
        it('should dispose without errors', () => {
            expect(() => slot.dispose()).not.toThrow();
        });

        /**
         * Verifies that the slot can still be used after disposal
         * since GaugeSlot has no cleanup requirements
         */
        it('should allow operations after disposal', () => {
            slot.dispose();

            // Should still work after disposal
            slot.set(5);
            expect(slot.value).toBe(5);

            slot.add(3);
            expect(slot.value).toBe(8);

            slot.reset();
            expect(slot.value).toBe(0);
        });
    });
});