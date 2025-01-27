import { UptimeSlot } from '@core/monitoring/metrics/slots/uptime';

/**
 * Test suite for UptimeSlot.
 * Verifies the slot's ability to track uptime by:
 * - Measuring elapsed time since creation
 * - Handling resets and manual time settings
 */
describe('UptimeSlot', () => {
    let slot: UptimeSlot;
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

        slot = new UptimeSlot();
    });

    afterEach(() => {
        // Restore the real Date constructor
        global.Date = RealDate;
    });

    /**
     * Initial state verification.
     * New slots should start with 0 uptime.
     */
    it('should start at 0', () => {
        expect(slot.value).toBe(0);
    });

    /**
     * Tests that lastModified always returns the current time.
     * The uptime slot updates its lastModified time on every value access.
     */
    it('should return current time for lastModified', () => {
        const initialTime = slot.lastModified.getTime();
        expect(initialTime).toBe(now);

        // Advance time and verify lastModified reflects the new time
        now += 5000;
        const newTime = slot.lastModified.getTime();
        expect(newTime).toBe(now);
    });

    /**
     * Verifies automatic time tracking.
     * As time advances, the uptime value should increase accordingly.
     */
    it('should track elapsed time', () => {
        // Advance time by 5 seconds
        now += 5000;
        expect(slot.value).toBe(5);

        // Advance time by another 3 seconds
        now += 3000;
        expect(slot.value).toBe(8);
    });

    /**
     * Tests manual start time setting in the past.
     * Setting a start time in the past should immediately show elapsed time.
     */
    it('should set start time manually', () => {
        // Set start time to 5 seconds ago
        slot.set(new RealDate(now - 5000));
        expect(slot.value).toBe(5);

        // Advance time by 3 seconds
        now += 3000;
        expect(slot.value).toBe(8);
    });

    /**
     * Tests manual start time setting in the future.
     * Setting a start time in the future should:
     * - Show 0 until that time is reached
     * - Start counting from 0 once the start time is passed
     */
    it('should handle setting future start time', () => {
        // Set start time to 5 seconds in the future
        slot.set(new RealDate(now + 5000));
        expect(slot.value).toBe(0);

        // Advance time by 8 seconds
        now += 8000;
        expect(slot.value).toBe(3);
    });

    /**
     * Tests the reset functionality.
     * Resetting should:
     * - Set the value back to 0
     * - Start counting from the reset point
     */
    it('should reset to current time', () => {
        // Advance time by 5 seconds
        now += 5000;
        expect(slot.value).toBe(5);

        // Reset the slot
        slot.reset();
        expect(slot.value).toBe(0);

        // Advance time by 3 seconds from reset point
        now += 3000;
        expect(slot.value).toBe(3);
    });

    /**
     * Tests cleanup behavior.
     * After disposal:
     * - The value should remain at 0
     * - Time tracking should stop
     */
    it('should handle disposal', () => {
        slot.dispose();

        // Advance time, value should not change after disposal
        now += 5000;
        expect(slot.value).toBe(0);
    });
});