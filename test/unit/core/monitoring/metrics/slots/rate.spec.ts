import { RateSlot } from '@core/monitoring/metrics/slots';

/**
 * Test suite for RateSlot.
 * RateSlot is used to track rates of events over time intervals.
 * It maintains:
 * - A current interval accumulator for incoming values
 * - A previous interval value that represents the rate
 * - An internal timer that updates values every second
 */
describe('RateSlot', () => {
    let slot: RateSlot;

    beforeEach(() => {
        // Create a fresh RateSlot instance for each test
        slot = new RateSlot();
    });

    afterEach(() => {
        // Clean up the slot to prevent timer leaks
        slot.dispose();
    });

    /**
     * Verifies that a new RateSlot starts with zero values.
     * Both the current interval accumulator and previous interval value should be 0.
     */
    it('should initialize with value 0', () => {
        // Check both the public rate value and internal accumulator
        expect(slot.value).toBe(0);
        expect(slot.accumulatedValue).toBe(0);
    });

    /**
     * Verifies that values are correctly accumulated within the current interval.
     * The accumulated value should update immediately, while the rate value
     * remains unchanged until the interval completes.
     */
    it('should add to current interval value correctly', () => {
        // Add positive value
        slot.add(5);
        expect(slot.accumulatedValue).toBe(5);

        // Add another positive value
        slot.add(3);
        expect(slot.accumulatedValue).toBe(8);

        // Add negative value (should subtract)
        slot.add(-4);
        expect(slot.accumulatedValue).toBe(4);

        // Rate value should not change until interval completes
        expect(slot.value).toBe(0);
    });

    /**
     * Verifies that reset() properly clears both the accumulator and rate value.
     * This is important for metrics that need to be reset without waiting for
     * the interval to complete.
     */
    it('should reset all values to 0', () => {
        // Add some value and verify it's accumulated
        slot.add(5);
        expect(slot.accumulatedValue).toBe(5);

        // Reset should clear both accumulator and rate value
        slot.reset();
        expect(slot.accumulatedValue).toBe(0);
        expect(slot.value).toBe(0);
    });

    /**
     * Verifies that floating point values are handled correctly.
     * This is important for rates that aren't whole numbers.
     */
    it('should handle floating point values', () => {
        // Add decimal value
        slot.add(1.5);
        expect(slot.accumulatedValue).toBe(1.5);

        // Add another decimal value
        slot.add(2.7);
        expect(slot.accumulatedValue).toBe(4.2);
    });

    /**
     * Verifies that values are correctly transferred from the accumulator
     * to the rate value when the interval completes.
     * This is the core functionality of the RateSlot.
     */
    it('should update last interval value after interval', (done) => {
        // Add value to current interval
        slot.add(5);
        expect(slot.accumulatedValue).toBe(5);
        expect(slot.value).toBe(0);

        // Wait for interval to complete
        setTimeout(() => {
            // Accumulator should be reset
            expect(slot.accumulatedValue).toBe(0);
            // Rate value should now show previous interval's total
            expect(slot.value).toBe(5);
            done();
        }, 1100); // Wait slightly longer than 1 second to ensure interval completes
    });

    /**
     * Verifies that multiple updates within a single interval are
     * correctly accumulated and transferred to the rate value.
     * Also verifies behavior across multiple intervals.
     */
    it('should accumulate multiple updates in one interval', (done) => {
        // Add multiple values in first interval
        slot.add(3);
        slot.add(2);
        expect(slot.accumulatedValue).toBe(5);
        expect(slot.value).toBe(0);

        // Wait for first interval to complete
        setTimeout(() => {
            // First interval's values should be transferred
            expect(slot.accumulatedValue).toBe(0);
            expect(slot.value).toBe(5);

            // Add values for second interval
            slot.add(1);
            slot.add(2);
            expect(slot.accumulatedValue).toBe(3);
            // Previous interval's value should still be shown
            expect(slot.value).toBe(5);

            // Wait for second interval to complete
            setTimeout(() => {
                // Second interval's values should be transferred
                expect(slot.accumulatedValue).toBe(0);
                expect(slot.value).toBe(3);
                done();
            }, 1100);
        }, 1100);
    });

    /**
     * Verifies that the static cleanup method properly clears the interval timer.
     * This is important for preventing memory leaks when the application shuts down.
     */
    it('should cleanup interval on static cleanup', () => {
        // Spy on global clearInterval
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        // Call static cleanup
        RateSlot.cleanup();

        // Verify interval was cleared
        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });

    /**
     * Verifies that disposing a RateSlot instance properly removes it from
     * the internal tracking set. This ensures disposed instances don't continue
     * receiving interval updates.
     */
    it('should remove instance from set on dispose', () => {
        // Spy on Set's delete method
        const deleteFromSetSpy = jest.spyOn(Set.prototype, 'delete');

        // Dispose the slot
        slot.dispose();

        // Verify instance was removed from set
        expect(deleteFromSetSpy).toHaveBeenCalledWith(slot);
        deleteFromSetSpy.mockRestore();
    });
});