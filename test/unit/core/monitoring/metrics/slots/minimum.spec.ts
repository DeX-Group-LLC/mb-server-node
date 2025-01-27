import { MinimumSlot } from '@core/monitoring/metrics/slots/minimum';

/**
 * Test suite for MinimumSlot.
 * Verifies the slot's ability to:
 * - Track minimum values
 * - Handle value additions
 * - Reset and cleanup state
 */
describe('MinimumSlot', () => {
    let slot: MinimumSlot;
    let now: number;
    let RealDate: DateConstructor;

    beforeEach(() => {
        // Store the real Date constructor
        RealDate = global.Date;
        now = 1000;

        // Mock Date to use our controlled timestamp
        global.Date = class extends RealDate {
            constructor();
            constructor(value: number | string);
            constructor(value?: number | string) {
                super();
                if (value !== undefined) {
                    return new RealDate(value);
                }
                return new RealDate(now);
            }

            static now() {
                return now;
            }
        } as DateConstructor;

        slot = new MinimumSlot();
    });

    afterEach(() => {
        // Restore the real Date constructor
        global.Date = RealDate;
    });

    /**
     * Initial state verification.
     * New slots should start with 0 as the minimum value.
     */
    it('should start at 0', () => {
        expect(slot.value).toBe(0);
    });

    /**
     * Tests that lastModified updates only when a new minimum is found.
     */
    it('should update lastModified only on new minimum', () => {
        const initialTime = slot.lastModified.getTime();
        expect(initialTime).toBe(now);

        // Add a value and verify lastModified is updated
        now += 5000;
        slot.add(10);
        const firstUpdateTime = slot.lastModified.getTime();
        expect(firstUpdateTime).toBe(now);

        // Add a larger value, lastModified should not change
        now += 5000;
        slot.add(20);
        expect(slot.lastModified.getTime()).toBe(firstUpdateTime);

        // Add a smaller value, lastModified should update
        now += 5000;
        slot.add(5);
        expect(slot.lastModified.getTime()).toBe(now);
    });

    /**
     * Tests minimum tracking with single value.
     * Adding a single value should result in that value being the minimum.
     */
    it('should track minimum with single value', () => {
        slot.add(10);
        expect(slot.value).toBe(10);
    });

    /**
     * Tests minimum tracking with multiple values.
     * Verifies that only smaller values update the minimum.
     */
    it('should track minimum value', () => {
        slot.add(10);
        expect(slot.value).toBe(10);

        // Larger value should not affect minimum
        slot.add(20);
        expect(slot.value).toBe(10);

        // Smaller value should become new minimum
        slot.add(5);
        expect(slot.value).toBe(5);

        // Equal value should not affect minimum
        slot.add(5);
        expect(slot.value).toBe(5);
    });

    /**
     * Tests the reset functionality.
     * Resetting should:
     * - Clear the minimum value back to initial state
     * - Update lastModified
     */
    it('should reset minimum tracking', () => {
        slot.add(10);
        slot.add(5);
        expect(slot.value).toBe(5);

        now += 5000;
        slot.reset();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);

        // Verify new values start fresh minimum tracking
        slot.add(20);
        expect(slot.value).toBe(20);
    });

    /**
     * Tests cleanup behavior.
     * Disposal should:
     * - Reset the minimum value
     * - Update lastModified
     */
    it('should handle disposal', () => {
        slot.add(10);
        slot.add(5);
        expect(slot.value).toBe(5);

        now += 5000;
        slot.dispose();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);
    });
});