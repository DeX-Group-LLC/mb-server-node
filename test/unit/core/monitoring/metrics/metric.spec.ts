import { Metric } from '@core/monitoring/metrics/metric';
import { BaseSlot } from '@core/monitoring/metrics/slots/base';
import { InternalError } from '@core/errors';

/**
 * Minimal mock slot for testing Metric class behavior.
 * Only implements the bare minimum required by BaseSlot.
 */
class MockSlot implements BaseSlot {
    value: number = 0;
    reset = jest.fn();
    dispose = jest.fn();
}

/**
 * Test suite for the Metric class.
 * Verifies the core functionality of metrics:
 * - Name validation
 * - Event emission
 * - Lifecycle management
 */
describe('Metric', () => {
    beforeEach(() => {
        // Reset all mock function calls between tests
        jest.clearAllMocks();
    });

    /**
     * Tests for metric name validation.
     * Metric names must follow specific format rules:
     * - Must start with a letter
     * - Can contain letters, numbers, and dots
     * - Maximum depth of 5 levels when split by dots
     */
    describe('name validation', () => {
        it('should accept valid names', () => {
            // Basic metric name with single dot
            const metric = new Metric('test.value', MockSlot);
            expect(metric.name).toBe('test.value');

            // Name with numbers after letters is valid
            expect(() => new Metric('test.value123', MockSlot)).not.toThrow();

            // Maximum allowed depth (5 levels) should work
            expect(() => new Metric('a.b.c.d.e', MockSlot)).not.toThrow();
        });

        it('should reject invalid names', () => {
            // Empty names are not allowed
            expect(() => new Metric('', MockSlot)).toThrow(InternalError);

            // Names cannot start or end with dots
            expect(() => new Metric('.test', MockSlot)).toThrow(InternalError);
            expect(() => new Metric('test.', MockSlot)).toThrow(InternalError);

            // Consecutive dots are not allowed
            expect(() => new Metric('test..value', MockSlot)).toThrow(InternalError);

            // Cannot exceed maximum depth of 5 levels
            expect(() => new Metric('a.b.c.d.e.f', MockSlot)).toThrow(InternalError);
        });
    });

    /**
     * Tests for core metric behavior.
     * Verifies that the metric properly:
     * - Delegates operations to its slot
     * - Emits appropriate events
     */
    describe('metric behavior', () => {
        let metric: Metric<MockSlot>;
        let resetListener: jest.Mock;
        let disposeListener: jest.Mock;

        beforeEach(() => {
            // Create fresh metric and listeners for each test
            metric = new Metric('test.value', MockSlot);
            resetListener = jest.fn();
            disposeListener = jest.fn();

            // Set up event listeners
            metric.on('reset', resetListener);
            metric.on('dispose', disposeListener);
        });

        it('should dispose properly', () => {
            // Dispose should delegate to slot and emit event
            metric.dispose();
            expect(metric.slot.dispose).toHaveBeenCalled();
            expect(disposeListener).toHaveBeenCalled();
        });
    });
});