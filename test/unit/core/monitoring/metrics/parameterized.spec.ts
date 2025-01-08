import { EventEmitter } from 'events';
import { ParameterizedMetric } from '@core/monitoring/metrics/parameterized';
import { BaseSlot } from '@core/monitoring/metrics/slots/base';
import { InternalError } from '@core/errors';

// Mock Metric class
jest.mock('@core/monitoring/metrics/metric', () => {
    class MockMetric extends EventEmitter {
        constructor(public name: string) {
            super();
        }
        dispose = jest.fn();
        static getCanonicalName = jest.fn(name => name.toLowerCase());
    }
    return { Metric: MockMetric };
});

/**
 * Mock slot for testing.
 * Implements only the minimum required interface.
 */
class MockSlot implements BaseSlot {
    value = 0;
    reset = jest.fn();
    dispose = jest.fn();
}

/**
 * Test suite for ParameterizedMetric.
 * Verifies the metric's ability to:
 * - Handle parameterized names
 * - Manage parameter values
 * - Create unique instances per parameter set
 */
describe('ParameterizedMetric', () => {
    let metric: ParameterizedMetric<MockSlot>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Create fresh parameterized metric for each test
        metric = new ParameterizedMetric('system.test.{param}', MockSlot);
    });

    /**
     * Tests for static methods.
     * Verifies parameter extraction and pattern matching.
     */
    describe('static methods', () => {
        it('should extract parameters from parameterized name', () => {
            const result = ParameterizedMetric.extract('system.test.{param:value}');
            expect(result).toBeDefined();
            expect(result!.template).toBe('system.test.{param}');
            expect(result!.params).toEqual({ param: 'value' });
        });

        it('should throw error for non-parameterized name', () => {
            expect(() => ParameterizedMetric.extract('system.test.value')).toThrow(InternalError);
            expect(() => ParameterizedMetric.extract('system.test.value')).toThrow('Invalid metric template');
        });

        it('should throw error for invalid parameter format', () => {
            expect(() => ParameterizedMetric.extract('system.test.{param:value:extra}')).toThrow(InternalError);
            expect(() => ParameterizedMetric.extract('system.test.{param:value:extra}')).toThrow('Invalid metric template');
        });
    });

    /**
     * Tests for parameterized name validation.
     * Names must follow the format: prefix{param}suffix where:
     * - prefix/suffix segments can contain letters and numbers
     * - parameter names can only contain letters
     */
    describe('name validation', () => {
        it('should accept valid parameterized names', () => {
            // Basic parameterized name
            expect(() => new ParameterizedMetric('system.test.{param}', MockSlot)).not.toThrow();

            // Multiple parameters
            expect(() => new ParameterizedMetric('system.{alpha}.{beta}.test', MockSlot)).not.toThrow();

            // Numbers allowed in segments, but not in parameter names
            expect(() => new ParameterizedMetric('system123.test456.{param}', MockSlot)).not.toThrow();
        });

        it('should reject invalid parameterized names', () => {
            // Missing parameter name
            expect(() => new ParameterizedMetric('system.test.{}', MockSlot)).toThrow(InternalError);

            // Numbers not allowed in parameter names
            expect(() => new ParameterizedMetric('system.test.{param123}', MockSlot)).toThrow(InternalError);

            // Invalid format
            expect(() => new ParameterizedMetric('system.test.param', MockSlot)).toThrow(InternalError);
            expect(() => new ParameterizedMetric('system.test.{param', MockSlot)).toThrow(InternalError);
            expect(() => new ParameterizedMetric('system.test.param}', MockSlot)).toThrow(InternalError);
        });
    });

    /**
     * Tests for parameter extraction and instance management.
     * Each unique parameter combination should have its own slot instance.
     */
    describe('parameter handling', () => {
        it('should create metrics with parameter values', () => {
            const instance = metric.registerMetric({ param: 'value' });

            // Should create instance with resolved name
            expect(instance).toBeDefined();
            expect(instance.name).toBe('system.test.{param:value}');

            // Should be retrievable by parameters
            expect(metric.getMetric({ param: 'value' })).toBe(instance);
        });

        it('should require all parameters to be provided', () => {
            const metric = new ParameterizedMetric('system.{alpha}.{beta}.test', MockSlot);

            // Missing parameter
            expect(() => metric.registerMetric({ alpha: 'v1' })).toThrow(InternalError);

            // Extra parameter
            expect(() => metric.registerMetric({ alpha: 'v1', beta: 'v2', gamma: 'v3' })).not.toThrow(InternalError);
        });

        it('should reject invalid parameter values', () => {
            // Invalid characters in value
            expect(() => metric.registerMetric({ param: 'value:with:colons' })).toThrow(InternalError);
            expect(() => metric.registerMetric({ param: 'value}with}braces' })).toThrow(InternalError);
        });

        it('should reject names not matching template pattern', () => {
            // Wrong parameter name
            expect(() => metric.getMetric('system.test.{wrong:value}')).toThrow(InternalError);

            // Wrong structure
            expect(() => metric.getMetric('wrong.test.{param:value}')).toThrow(InternalError);
        });

        it('should reuse instances for same parameters', () => {
            const params = { param: 'value' };

            // Register first instance
            const instance1 = metric.registerMetric(params);
            expect(instance1).toBeDefined();

            // Getting with same parameters should return same instance
            const instance2 = metric.getMetric(params);
            expect(instance2).toBeDefined();
            expect(instance2).toBe(instance1);

            // Registering again should throw
            expect(() => metric.registerMetric(params)).toThrow(InternalError);
        });

        it('should create different instances for different parameters', () => {
            // Register instances with different parameter values
            const instance1 = metric.registerMetric({ param: 'value1' });
            const instance2 = metric.registerMetric({ param: 'value2' });

            // Should be different instances
            expect(instance1).toBeDefined();
            expect(instance2).toBeDefined();
            expect(instance1).not.toBe(instance2);
            expect(instance1.name).toBe('system.test.{param:value1}');
            expect(instance2.name).toBe('system.test.{param:value2}');

            // Should be retrievable by parameters
            expect(metric.getMetric({ param: 'value1' })).toBe(instance1);
            expect(metric.getMetric({ param: 'value2' })).toBe(instance2);
        });
    });

    /**
     * Tests for metric lifecycle management.
     * Verifies proper cleanup of metrics and event handling.
     */
    describe('lifecycle', () => {
        it('should provide access to all metrics', () => {
            // Register multiple instances
            const instance1 = metric.registerMetric({ param: 'value1' });
            const instance2 = metric.registerMetric({ param: 'value2' });

            // Should be able to iterate over all metrics
            const metrics = Array.from(metric.allMetrics);
            expect(metrics).toHaveLength(2);
            expect(metrics).toContain(instance1);
            expect(metrics).toContain(instance2);
        });

        it('should remove instances on disposal', () => {
            // Register an instance
            const instance = metric.registerMetric({ param: 'value' });
            expect(metric.getMetric({ param: 'value' })).toBe(instance);

            // Dispose the instance
            instance.emit('dispose');

            // Instance should be removed
            expect(metric.getMetric({ param: 'value' })).toBeUndefined();
        });

        it('should dispose all metrics on template disposal', () => {
            // Register multiple instances
            const instance1 = metric.registerMetric({ param: 'value1' });
            const instance2 = metric.registerMetric({ param: 'value2' });
            const disposeListener = jest.fn();
            metric.on('dispose', disposeListener);

            // Dispose the template
            metric.dispose();

            // All instances should be disposed
            expect(instance1.dispose).toHaveBeenCalled();
            expect(instance2.dispose).toHaveBeenCalled();

            // All instances should be removed
            expect(Array.from(metric.allMetrics)).toHaveLength(0);

            // Dispose event should be emitted
            expect(disposeListener).toHaveBeenCalledWith(metric);
        });
    });

    /**
     * Tests for metric name matching and retrieval.
     * Verifies pattern matching and instance retrieval by name.
     */
    describe('name matching', () => {
        it('should match valid metric names', () => {
            // Basic match
            expect(metric.matches('system.test.{param:value}')).toBe(true);

            // Case insensitive
            expect(metric.matches('SYSTEM.TEST.{PARAM:VALUE}')).toBe(true);

            // Different parameter values
            expect(metric.matches('system.test.{param:123}')).toBe(true);
            expect(metric.matches('system.test.{param:value-with-dashes}')).toBe(true);
        });

        it('should not match invalid metric names', () => {
            // Wrong structure
            expect(metric.matches('wrong.test.{param:value}')).toBe(false);
            expect(metric.matches('system.wrong.{param:value}')).toBe(false);

            // Wrong parameter name
            expect(metric.matches('system.test.{wrong:value}')).toBe(false);

            // Missing parameter value
            expect(metric.matches('system.test.{param}')).toBe(false);

            // Non-parameterized name
            expect(metric.matches('system.test.value')).toBe(false);
        });

        it('should retrieve metrics by exact name', () => {
            // Register a metric
            const instance = metric.registerMetric({ param: 'value' });

            // Should retrieve by exact name
            expect(metric.getMetricByName('system.test.{param:value}')).toBe(instance);

            // Should retrieve case insensitively
            expect(metric.getMetricByName('SYSTEM.TEST.{PARAM:VALUE}')).toBe(instance);
        });

        it('should handle metric retrieval edge cases', () => {
            // Register a metric
            const instance = metric.registerMetric({ param: 'value' });

            // Should return undefined for non-existent metrics
            expect(metric.getMetricByName('system.test.{param:other}')).toBeUndefined();

            // Should throw for invalid names
            expect(() => metric.getMetricByName('wrong.test.{param:value}')).toThrow(InternalError);
            expect(() => metric.getMetricByName('system.test.{wrong:value}')).toThrow(InternalError);
        });
    });
});
