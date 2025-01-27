import { BaseSlot } from '@core/monitoring/metrics/slots/base';

/**
 * Concrete implementation of BaseSlot for testing.
 * Provides minimal implementation of abstract methods.
 */
class TestSlot extends BaseSlot {
    private _value: number = 0;

    get value(): number {
        return this._value;
    }

    set value(val: number) {
        this._value = val;
        this._lastModified = new Date();
    }

    reset(): void {
        this._value = 0;
        this._lastModified = new Date();
    }

    dispose(): void {
        this.reset();
    }
}

/**
 * Test suite for BaseSlot.
 * Verifies the base slot functionality using a concrete implementation:
 * - Last modified time tracking
 * - Abstract method contracts
 */
describe('BaseSlot', () => {
    let slot: TestSlot;
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

        slot = new TestSlot();
    });

    afterEach(() => {
        // Restore the real Date constructor
        global.Date = RealDate;
    });

    /**
     * Tests initial state of the base slot.
     * Verifies that lastModified is set to creation time.
     */
    it('should initialize with current time', () => {
        expect(slot.lastModified.getTime()).toBe(now);
    });

    /**
     * Tests that lastModified reflects when the value was last changed.
     * Verifies the timestamp updates when value changes.
     */
    it('should track last modified time', () => {
        const initialTime = slot.lastModified.getTime();
        expect(initialTime).toBe(now);

        // Update value and verify lastModified changes
        now += 5000;
        slot.value = 42;
        expect(slot.lastModified.getTime()).toBe(now);
    });

    /**
     * Tests reset functionality from base implementation.
     * Verifies that reset updates lastModified.
     */
    it('should update lastModified on reset', () => {
        slot.value = 42;
        const valueSetTime = slot.lastModified.getTime();

        now += 5000;
        slot.reset();

        expect(slot.lastModified.getTime()).toBe(now);
        expect(slot.lastModified.getTime()).not.toBe(valueSetTime);
        expect(slot.value).toBe(0);
    });

    /**
     * Tests disposal functionality from base implementation.
     * Verifies that dispose cleans up state and updates lastModified.
     */
    it('should handle disposal', () => {
        slot.value = 42;
        const valueSetTime = slot.lastModified.getTime();

        now += 5000;
        slot.dispose();

        expect(slot.lastModified.getTime()).toBe(now);
        expect(slot.lastModified.getTime()).not.toBe(valueSetTime);
        expect(slot.value).toBe(0);
    });
});