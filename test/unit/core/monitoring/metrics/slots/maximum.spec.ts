import { MaximumSlot } from '@core/monitoring/metrics/slots/maximum';

/**
 * Test suite for MaximumSlot.
 * Verifies the slot's ability to:
 * - Track maximum values
 * - Handle value additions
 * - Reset and cleanup state
 */
describe('MaximumSlot', () => {
    let slot: MaximumSlot;
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

        slot = new MaximumSlot();
    });

    afterEach(() => {
        // Restore the real Date constructor
        global.Date = RealDate;
    });

    /**
     * Initial state verification.
     * New slots should start with 0 as the maximum value.
     */
    it('should start at 0', () => {
        expect(slot.value).toBe(0);
    });

    /**
     * Tests that lastModified updates only when a new maximum is found.
     */
    it('should update lastModified only on new maximum', () => {
        const initialTime = slot.lastModified.getTime();
        expect(initialTime).toBe(now);

        // Add a value and verify lastModified is updated
        now += 5000;
        slot.add(10);
        const firstUpdateTime = slot.lastModified.getTime();
        expect(firstUpdateTime).toBe(now);

        // Add a smaller value, lastModified should not change
        now += 5000;
        slot.add(5);
        expect(slot.lastModified.getTime()).toBe(firstUpdateTime);

        // Add a larger value, lastModified should update
        now += 5000;
        slot.add(20);
        expect(slot.lastModified.getTime()).toBe(now);
    });

    /**
     * Tests maximum tracking with single value.
     * Adding a single value should result in that value being the maximum.
     */
    it('should track maximum with single value', () => {
        slot.add(10);
        expect(slot.value).toBe(10);
    });

    /**
     * Tests maximum tracking with multiple values.
     * Verifies that only larger values update the maximum.
     */
    it('should track maximum value', () => {
        slot.add(10);
        expect(slot.value).toBe(10);

        // Smaller value should not affect maximum
        slot.add(5);
        expect(slot.value).toBe(10);

        // Larger value should become new maximum
        slot.add(20);
        expect(slot.value).toBe(20);

        // Equal value should not affect maximum
        slot.add(20);
        expect(slot.value).toBe(20);
    });

    /**
     * Tests the reset functionality.
     * Resetting should:
     * - Clear the maximum value back to initial state
     * - Update lastModified
     */
    it('should reset maximum tracking', () => {
        slot.add(10);
        slot.add(20);
        expect(slot.value).toBe(20);

        now += 5000;
        slot.reset();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);

        // Verify new values start fresh maximum tracking
        slot.add(5);
        expect(slot.value).toBe(5);
    });

    /**
     * Tests cleanup behavior.
     * Disposal should:
     * - Reset the maximum value
     * - Update lastModified
     */
    it('should handle disposal', () => {
        slot.add(10);
        slot.add(20);
        expect(slot.value).toBe(20);

        now += 5000;
        slot.dispose();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);
    });
});