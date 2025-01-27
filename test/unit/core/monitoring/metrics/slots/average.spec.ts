import { AverageSlot } from '@core/monitoring/metrics/slots/average';

/**
 * Test suite for AverageSlot.
 * Verifies the slot's ability to:
 * - Calculate running averages
 * - Handle value additions
 * - Reset and cleanup state
 */
describe('AverageSlot', () => {
    let slot: AverageSlot;
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

        slot = new AverageSlot();
    });

    afterEach(() => {
        // Restore the real Date constructor
        global.Date = RealDate;
    });

    /**
     * Initial state verification.
     * New slots should start with 0 average.
     */
    it('should start at 0', () => {
        expect(slot.value).toBe(0);
    });

    /**
     * Tests that lastModified updates when values are added.
     * The average slot updates its lastModified time on every add operation.
     */
    it('should update lastModified on add', () => {
        const initialTime = slot.lastModified.getTime();
        expect(initialTime).toBe(now);

        // Add a value and verify lastModified is updated
        now += 5000;
        slot.add(10);
        expect(slot.lastModified.getTime()).toBe(now);
    });

    /**
     * Tests average calculation with single value.
     * Adding a single value should result in that value being the average.
     */
    it('should calculate average with single value', () => {
        slot.add(10);
        expect(slot.value).toBe(10);
    });

    /**
     * Tests average calculation with multiple values.
     * Verifies running average is correctly maintained as values are added.
     */
    it('should calculate running average', () => {
        slot.add(10);
        expect(slot.value).toBe(10);

        slot.add(20);
        expect(slot.value).toBe(15); // (10 + 20) / 2

        slot.add(30);
        expect(slot.value).toBe(20); // (10 + 20 + 30) / 3
    });

    /**
     * Tests the reset functionality.
     * Resetting should:
     * - Clear all accumulated values
     * - Return average to 0
     * - Update lastModified
     */
    it('should reset average calculation', () => {
        slot.add(10);
        slot.add(20);
        expect(slot.value).toBe(15);

        now += 5000;
        slot.reset();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);

        // Verify new values start fresh average
        slot.add(30);
        expect(slot.value).toBe(30);
    });

    /**
     * Tests cleanup behavior.
     * Disposal should:
     * - Reset the average to 0
     * - Update lastModified
     */
    it('should handle disposal', () => {
        slot.add(10);
        slot.add(20);
        expect(slot.value).toBe(15);

        now += 5000;
        slot.dispose();
        expect(slot.value).toBe(0);
        expect(slot.lastModified.getTime()).toBe(now);
    });
});