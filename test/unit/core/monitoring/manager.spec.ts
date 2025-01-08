import { EventEmitter } from 'events';
import { InternalError } from '@core/errors';
import { MonitoringManager } from '@core/monitoring/manager';
import { Metric } from '@core/monitoring/metrics/metric';
import { ParameterizedMetric } from '@core/monitoring/metrics/parameterized';
import { BaseSlot } from '@core/monitoring/metrics/slots/base';

// Mock dependencies
jest.mock('@core/monitoring/metrics/metric');
jest.mock('@core/monitoring/metrics/parameterized');

/**
 * Mock slot for testing.
 * Implements only the minimum required interface for BaseSlot.
 * Used to verify metric behavior without testing actual slot implementations.
 */
class MockSlot implements BaseSlot {
    value = 0;
    reset = jest.fn();
    dispose = jest.fn();
}

/**
 * Test suite for MonitoringManager.
 * Verifies the manager's core responsibilities:
 * - Creating and tracking regular metrics
 * - Creating and tracking parameterized metrics
 * - Looking up metrics by name
 * - Handling metric disposal and cleanup
 * - Managing the lifecycle of all metrics
 */
describe('MonitoringManager', () => {
    let manager: MonitoringManager;
    let mockSlot: MockSlot;
    const MockMetric = Metric as jest.MockedClass<typeof Metric>;
    const MockParameterizedMetric = ParameterizedMetric as jest.MockedClass<typeof ParameterizedMetric>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSlot = new MockSlot();

        // Setup mock for regular Metric class
        // Creates a basic EventEmitter with name, slot, and dispose functionality
        MockMetric.mockImplementation((name: string) => {
            const instance = new EventEmitter() as Metric;
            Object.defineProperty(instance, 'name', { get: () => name });
            Object.defineProperty(instance, 'slot', { get: () => mockSlot });
            instance.dispose = jest.fn().mockImplementation(() => instance.emit('dispose'));
            return instance;
        });
        // Mock canonical name conversion (lowercase)
        MockMetric.getCanonicalName = jest.fn(name => name.toLowerCase());

        // Setup mock for ParameterizedMetric class
        // Creates a basic EventEmitter with template and metric creation functionality
        MockParameterizedMetric.mockImplementation((template: string) => {
            const instance = new EventEmitter() as ParameterizedMetric;
            Object.defineProperty(instance, 'template', { get: () => template });
            instance.dispose = jest.fn().mockImplementation(() => instance.emit('dispose'));
            // Mock getMetric to return a new metric instance with the mockSlot
            instance.getMetric = jest.fn().mockImplementation((name: string) => {
                const metric = new EventEmitter() as Metric;
                Object.defineProperty(metric, 'name', { get: () => name });
                Object.defineProperty(metric, 'slot', { get: () => mockSlot });
                metric.dispose = jest.fn().mockImplementation(() => metric.emit('dispose'));
                return metric;
            });
            return instance;
        });
        // Default to non-parameterized metrics
        MockParameterizedMetric.isParameterized = jest.fn().mockReturnValue(false);
        (MockParameterizedMetric.extract as jest.Mock).mockReturnValue(undefined);

        // Create fresh manager for each test
        manager = new MonitoringManager();
    });

    /**
     * Tests for regular (non-parameterized) metric functionality.
     * Verifies:
     * - Basic metric creation and registration
     * - Prevention of duplicate metrics
     * - Prevention of direct parameterized metric creation
     * - Proper cleanup on metric disposal
     */
    describe('regular metrics', () => {
        /**
         * Verifies that a regular metric can be created and tracked by the manager.
         * The metric should be accessible via getMetric after creation.
         */
        it('should create and track a regular metric', () => {
            // Create a basic metric
            const metric = manager.registerMetric('test.metric', MockSlot);

            // Verify the metric is tracked and accessible
            expect(manager.getMetric('test.metric')).toBeDefined();
        });

        /**
         * Verifies that attempting to create a duplicate metric throws an error.
         * This ensures metric names remain unique within the manager.
         */
        it('should prevent duplicate metric creation', () => {
            // Create the initial metric
            manager.registerMetric('test.metric', MockSlot);

            // Verify that creating another metric with the same name throws
            expect(() => {
                manager.registerMetric('test.metric', MockSlot);
            }).toThrow(InternalError);
        });

        /**
         * Verifies that attempting to create a parameterized metric directly through
         * registerMetric throws an error. Parameterized metrics must be created through
         * registerParameterized.
         */
        it('should prevent direct parameterized metric creation', () => {
            // Setup mock to identify the name as parameterized
            MockParameterizedMetric.isParameterized = jest.fn().mockReturnValue(true);

            // Verify that attempting to create a parameterized metric directly throws
            expect(() => {
                manager.registerMetric('test.{param}.metric', MockSlot);
            }).toThrow(InternalError);
        });

        /**
         * Verifies that when a metric is disposed, it is properly removed from the manager
         * and can no longer be accessed.
         */
        it('should remove metric when disposed', () => {
            // Create a metric and trigger its disposal
            const metric = manager.registerMetric('test.metric', MockSlot);
            metric.dispose();

            // Verify the metric is no longer accessible
            expect(manager.getMetric('test.metric')).toBeUndefined();
        });
    });

    /**
     * Tests for parameterized metric functionality.
     * Verifies:
     * - Template creation and registration
     * - Prevention of duplicate templates
     * - Metric lookup by parameterized name
     * - Proper cleanup on template disposal
     */
    describe('parameterized metrics', () => {
        beforeEach(() => {
            // Setup parameterized metric detection
            // Identifies names containing {param} as parameterized
            MockParameterizedMetric.isParameterized = jest.fn()
                .mockImplementation(name => name.includes('{param}'));
        });

        /**
         * Verifies that a parameterized metric template can be created and tracked.
         * The template should be ready to create individual metrics.
         */
        it('should create and track a parameterized metric', () => {
            // Create a parameterized metric template
            const metric = manager.registerParameterized('test.{param}.metric', MockSlot);

            // Verify the template was created successfully
            expect(metric).toBeInstanceOf(EventEmitter);
        });

        /**
         * Verifies that attempting to create a duplicate parameterized metric template
         * throws an error. This ensures template names remain unique.
         */
        it('should prevent duplicate parameterized metric creation', () => {
            // Create the initial template
            manager.registerParameterized('test.{param}.metric', MockSlot);

            // Verify that creating another template with the same pattern throws
            expect(() => {
                manager.registerParameterized('test.{param}.metric', MockSlot);
            }).toThrow(InternalError);
        });

        /**
         * Verifies that metrics can be looked up using their full parameterized name.
         * The manager should find the correct template and return the appropriate metric.
         */
        it('should lookup parameterized metrics by full name', () => {
            // Setup mocks for parameterized name handling
            MockParameterizedMetric.isParameterized = jest.fn().mockReturnValue(true);
            (MockParameterizedMetric.extract as jest.Mock).mockReturnValue('test.{param}.metric');

            // Create the template and setup mock metric response
            const parameterized = manager.registerParameterized('test.{param}.metric', MockSlot);
            (parameterized.getMetric as jest.Mock).mockReturnValue({
                name: 'test.{param:value}.metric',
                slot: mockSlot
            });

            // Verify lookup with full parameterized name returns the correct slot
            expect(manager.getMetric('test.{param:value}.metric')).toBe(mockSlot);
        });

        /**
         * Verifies that looking up a metric with a parameterized name returns undefined
         * if no matching template exists.
         */
        it('should return undefined when parameterized metric template not found', () => {
            // Setup mocks for parameterized name handling
            MockParameterizedMetric.isParameterized = jest.fn().mockReturnValue(true);
            (MockParameterizedMetric.extract as jest.Mock).mockReturnValue('test.{param}.metric');

            // Verify lookup returns undefined when no matching template exists
            expect(manager.getMetric('test.{param:value}.metric')).toBeUndefined();
        });

        /**
         * Verifies that when a parameterized metric template is disposed,
         * all its metrics are properly cleaned up and can no longer be accessed.
         */
        it('should remove parameterized metric when disposed', () => {
            // Create and dispose a parameterized metric template
            const metric = manager.registerParameterized('test.{param}.metric', MockSlot);
            metric.dispose();

            // Verify metrics from this template can no longer be accessed
            expect(manager.getMetric('test.{param:value}.metric')).toBeUndefined();
        });
    });

    /**
     * Tests for manager disposal functionality.
     * Verifies that the manager properly cleans up all metrics when disposed.
     */
    describe('dispose', () => {
        /**
         * Verifies that disposing the manager:
         * - Calls dispose on all regular metrics
         * - Calls dispose on all parameterized metric templates
         * - Makes all metrics inaccessible
         */
        it('should dispose all metrics', () => {
            // Create both types of metrics
            const regular = manager.registerMetric('test.metric', MockSlot);
            const parameterized = manager.registerParameterized('test.{param}.metric', MockSlot);

            // Dispose the entire manager
            manager.dispose();

            // Verify all metrics were properly disposed
            expect(regular.dispose).toHaveBeenCalled();
            expect(parameterized.dispose).toHaveBeenCalled();
            // Verify all metrics are now inaccessible
            expect(manager.getMetric('test.metric')).toBeUndefined();
            expect(manager.getMetric('test.{param:value}.metric')).toBeUndefined();
        });
    });
});
