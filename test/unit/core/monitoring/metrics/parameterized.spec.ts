import { EventEmitter } from 'events';
import { ParameterizedMetric } from '@core/monitoring/metrics/parameterized';
import { BaseSlot } from '@core/monitoring/metrics/slots/base';
import { InternalError } from '@core/errors';
import { jest } from '@jest/globals';
import { GaugeSlot } from '@core/monitoring/metrics/slots';
import { Metric } from '@core/monitoring/metrics';

// Mock Metric class
jest.mock('@core/monitoring/metrics', () => {
    class MockMetric extends EventEmitter {
        public slot: BaseSlot;
        public dispose = jest.fn();

        constructor(public name: string, SlotClass: new () => BaseSlot) {
            super();
            this.slot = new SlotClass();
        }

        static getCanonicalName(name: string): string {
            return name.toLowerCase();
        }
    }

    return { Metric: MockMetric };
});

/**
 * Mock slot for testing.
 * Implements only the minimum required interface.
 */
class MockSlot extends BaseSlot {
    protected _value: number = 0;
    protected _lastModified: Date = new Date();

    constructor() {
        super();
    }

    get value(): number {
        return this._value;
    }

    set(value: number): void {
        this._value = value;
        this._lastModified = new Date();
    }

    reset(): void {
        this._value = 0;
        this._lastModified = new Date();
    }

    dispose(): void {
        // No-op for testing
    }
}

/**
 * Test suite for ParameterizedMetric.
 * Verifies the metric's ability to:
 * - Handle parameterized names
 * - Manage parameter values
 * - Create unique instances per parameter set
 */
describe('ParameterizedMetric', () => {
    let metric: ParameterizedMetric<BaseSlot>;

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
            expect(result.template).toBe('system.test.{param}');
            expect(result.params).toEqual({ param: 'value' });
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
            expect(() => metric.registerMetric({ alpha: 'v1', beta: 'v2', gamma: 'v3' })).not.toThrow();
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
            const metric = new ParameterizedMetric('system.cpu.{core}.usage', GaugeSlot);
            const instance1 = metric.registerMetric({ core: '0' });
            const instance2 = metric.registerMetric({ core: '1' });

            // Create spies for the dispose methods
            const spy1 = jest.spyOn(instance1, 'dispose');
            const spy2 = jest.spyOn(instance2, 'dispose');

            // Dispose the parameterized metric
            metric.dispose();

            // All instances should be disposed
            expect(spy1).toHaveBeenCalled();
            expect(spy2).toHaveBeenCalled();

            // All instances should be removed
            expect(metric.getMetric({ core: '0' })).toBeUndefined();
            expect(metric.getMetric({ core: '1' })).toBeUndefined();
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
        });
    });

    describe('constructor', () => {
        it('should create a valid parameterized metric', () => {
            const metric = new ParameterizedMetric('system.cpu.{core}.usage', GaugeSlot);
            expect(metric).toBeDefined();
            expect(metric.template).toBe('system.cpu.{core}.usage');
        });

        it('should throw on invalid template format', () => {
            expect(() => {
                new ParameterizedMetric('invalid..template', GaugeSlot);
            }).toThrow(InternalError);

            expect(() => {
                new ParameterizedMetric('.invalid.start', GaugeSlot);
            }).toThrow(InternalError);

            expect(() => {
                new ParameterizedMetric('invalid.end.', GaugeSlot);
            }).toThrow(InternalError);
        });

        it('should throw on non-parameterized template', () => {
            expect(() => {
                new ParameterizedMetric('system.cpu.usage', GaugeSlot);
            }).toThrow(InternalError);
        });

        it('should handle case insensitivity', () => {
            const metric = new ParameterizedMetric('System.CPU.{Core}.Usage', GaugeSlot);
            expect(metric.template).toBe('system.cpu.{core}.usage');
        });
    });

    describe('registerMetric', () => {
        let metric: ParameterizedMetric<GaugeSlot>;

        beforeEach(() => {
            metric = new ParameterizedMetric('system.cpu.{core}.usage', GaugeSlot);
        });

        it('should register a new metric instance', () => {
            const instance = metric.registerMetric({ core: '0' });
            expect(instance).toBeDefined();
            expect(instance.name).toBe('system.cpu.{core:0}.usage');
            expect(instance.slot).toBeInstanceOf(GaugeSlot);
        });

        it('should throw when registering duplicate metric', () => {
            metric.registerMetric({ core: '0' });
            expect(() => {
                metric.registerMetric({ core: '0' });
            }).toThrow(InternalError);
        });

        it('should throw when parameter value is invalid', () => {
            expect(() => {
                metric.registerMetric({ core: 'invalid:value' });
            }).toThrow(InternalError);
        });

        it('should throw when parameter is missing', () => {
            expect(() => {
                metric.registerMetric({});
            }).toThrow(InternalError);
        });

        it('should handle multiple parameters', () => {
            const multiParamMetric = new ParameterizedMetric('system.disk.{device}.{partition}.usage', GaugeSlot);
            const instance = multiParamMetric.registerMetric({ device: 'sda', partition: '1' });
            expect(instance.name).toBe('system.disk.{device:sda}.{partition:1}.usage');
        });
    });

    describe('getMetric', () => {
        let metric: ParameterizedMetric<GaugeSlot>;

        beforeEach(() => {
            metric = new ParameterizedMetric('system.cpu.{core}.usage', GaugeSlot);
        });

        it('should get metric by parameters', () => {
            const instance = metric.registerMetric({ core: '0' });
            const retrieved = metric.getMetric({ core: '0' });
            expect(retrieved).toBe(instance);
        });

        it('should get metric by name', () => {
            const instance = metric.registerMetric({ core: '0' });
            const retrieved = metric.getMetric('system.cpu.{core:0}.usage');
            expect(retrieved).toBe(instance);
        });

        it('should return undefined for non-existent metric', () => {
            expect(metric.getMetric({ core: '0' })).toBeUndefined();
            expect(metric.getMetric('system.cpu.{core:0}.usage')).toBeUndefined();
        });

        it('should throw when name does not match template', () => {
            expect(() => {
                metric.getMetric('system.memory.{core:0}.usage');
            }).toThrow(InternalError);
        });
    });

    describe('filteredMetrics', () => {
        let metric: ParameterizedMetric<GaugeSlot>;

        beforeEach(() => {
            metric = new ParameterizedMetric('system.cpu.{core}.{type}.usage', GaugeSlot);
            metric.registerMetric({ core: '0', type: 'user' });
            metric.registerMetric({ core: '0', type: 'system' });
            metric.registerMetric({ core: '1', type: 'user' });
            metric.registerMetric({ core: '1', type: 'system' });
        });

        it('should filter metrics by single parameter', () => {
            const filtered = Array.from(metric.filteredMetrics({ core: '0' }));
            expect(filtered).toHaveLength(2);
            expect(filtered.map(m => m.name)).toEqual([
                'system.cpu.{core:0}.{type:user}.usage',
                'system.cpu.{core:0}.{type:system}.usage'
            ]);
        });

        it('should filter metrics by multiple parameters', () => {
            const filtered = Array.from(metric.filteredMetrics({ core: '0', type: 'user' }));
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('system.cpu.{core:0}.{type:user}.usage');
        });

        it('should return empty iterator for non-matching parameters', () => {
            const filtered = Array.from(metric.filteredMetrics({ core: '2' }));
            expect(filtered).toHaveLength(0);
        });

        it('should return empty iterator for invalid parameters', () => {
            const filtered = Array.from(metric.filteredMetrics({ invalid: 'param' }));
            expect(filtered).toHaveLength(0);
        });
    });

    describe('dispose', () => {
        it('should dispose all metric instances', () => {
            const metric = new ParameterizedMetric('system.cpu.{core}.usage', GaugeSlot);
            const instance1 = metric.registerMetric({ core: '0' });
            const instance2 = metric.registerMetric({ core: '1' });

            // Create spies for the dispose methods
            const spy1 = jest.spyOn(instance1, 'dispose');
            const spy2 = jest.spyOn(instance2, 'dispose');

            // Dispose the parameterized metric
            metric.dispose();

            // Verify all instances were disposed
            expect(spy1).toHaveBeenCalled();
            expect(spy2).toHaveBeenCalled();

            // Verify metrics were cleared
            expect(metric.getMetric({ core: '0' })).toBeUndefined();
            expect(metric.getMetric({ core: '1' })).toBeUndefined();
        });
    });
});
