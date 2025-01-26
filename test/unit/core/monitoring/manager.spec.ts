import { jest } from '@jest/globals';
import { MonitoringManager } from '@core/monitoring';
import { GaugeSlot, RateSlot } from '@core/monitoring/metrics/slots';
import { InternalError } from '@core/errors';
import logger from '@utils/logger';

// Mock logger
jest.mock('@utils/logger', () => {
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn()
    };
    return {
        __esModule: true,
        default: mockLogger,
        SetupLogger: jest.fn().mockReturnValue(mockLogger)
    };
});

/**
 * Test suite for MonitoringManager class.
 * Tests the core functionality of the monitoring system.
 *
 * Key areas tested:
 * - Metric registration and retrieval
 * - Parameterized metrics
 * - Error handling
 * - Metric serialization
 * - Cleanup and disposal
 */
describe('MonitoringManager', () => {
    let manager: MonitoringManager;

    beforeEach(() => {
        jest.resetAllMocks();
        manager = new MonitoringManager();
    });

    describe('registerMetric', () => {
        it('should register a new metric', () => {
            const metric = manager.registerMetric('system.cpu.usage', GaugeSlot);
            expect(metric).toBeDefined();
            expect(metric.name).toBe('system.cpu.usage');
            expect(metric.slot).toBeInstanceOf(GaugeSlot);
        });

        it('should throw when registering duplicate metric', () => {
            manager.registerMetric('system.cpu.usage', GaugeSlot);
            expect(() => {
                manager.registerMetric('system.cpu.usage', GaugeSlot);
            }).toThrow(InternalError);
        });

        it('should throw when registering parameterized metric directly', () => {
            expect(() => {
                manager.registerMetric('system.cpu.{core}.usage', GaugeSlot);
            }).toThrow(InternalError);
        });

        it('should remove metric when disposed', () => {
            const metric = manager.registerMetric('system.cpu.usage', GaugeSlot);
            metric.dispose();
            expect(manager.getMetric('system.cpu.usage')).toBeUndefined();
        });
    });

    describe('registerParameterized', () => {
        it('should register a new parameterized metric', () => {
            const metric = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            expect(metric).toBeDefined();
            expect(metric.template).toBe('system.cpu.{core}.usage');
        });

        it('should throw when registering duplicate parameterized metric', () => {
            manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            expect(() => {
                manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            }).toThrow(InternalError);
        });

        it('should create and track individual metrics', () => {
            const metric = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            const instance = metric.registerMetric({ core: '0' });
            expect(instance).toBeDefined();
            instance.slot.set(42);
            const retrievedMetric = manager.getMetric('system.cpu.{core:0}.usage');
            expect(retrievedMetric).toBeDefined();
            expect(retrievedMetric?.value).toBe(42);
        });

        it('should remove all metrics when disposed', () => {
            const metric = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            const instance = metric.registerMetric({ core: '0' });
            expect(instance).toBeDefined();
            instance.slot.set(42);
            const retrievedMetric = manager.getMetric('system.cpu.{core:0}.usage');
            expect(retrievedMetric).toBeDefined();
            expect(retrievedMetric?.value).toBe(42);
            metric.dispose();
            expect(manager.getMetric('system.cpu.{core:0}.usage')).toBeUndefined();
        });
    });

    describe('getMetric', () => {
        it('should return undefined for non-existent metric', () => {
            expect(manager.getMetric('system.cpu.usage')).toBeUndefined();
        });

        it('should return metric slot for regular metric', () => {
            const metric = manager.registerMetric('system.cpu.usage', GaugeSlot);
            metric.slot.set(42);
            const slot = manager.getMetric('system.cpu.usage');
            expect(slot).toBeDefined();
            expect(slot?.value).toBe(42);
        });

        it('should return metric slot for parameterized metric', () => {
            const metric = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            const instance = metric.registerMetric({ core: '0' });
            expect(instance).toBeDefined();
            instance.slot.set(42);
            const retrievedMetric = manager.getMetric('system.cpu.{core:0}.usage');
            expect(retrievedMetric).toBeDefined();
            expect(retrievedMetric?.value).toBe(42);
        });
    });

    describe('serializeMetrics', () => {
        beforeEach(() => {
            // Setup some test metrics
            const cpuUsage = manager.registerMetric('system.cpu.usage', GaugeSlot);
            cpuUsage.slot.set(75);

            const memoryUsage = manager.registerMetric('system.memory.usage', GaugeSlot);
            memoryUsage.slot.set(1024);

            const cpuCoreUsage = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            const core0 = cpuCoreUsage.registerMetric({ core: '0' });
            const core1 = cpuCoreUsage.registerMetric({ core: '1' });
            expect(core0).toBeDefined();
            expect(core1).toBeDefined();
            core0.slot.set(80);
            core1.slot.set(60);

            const networkRate = manager.registerParameterized('system.network.{interface}.rate', RateSlot);
            const eth0 = networkRate.registerMetric({ interface: 'eth0' });
            const wlan0 = networkRate.registerMetric({ interface: 'wlan0' });
            expect(eth0).toBeDefined();
            expect(wlan0).toBeDefined();
            eth0.slot.add(100);
            wlan0.slot.add(50);
        });

        it('should serialize metrics with values only', async () => {
            // Wait for rate interval to complete
            await new Promise(resolve => setTimeout(resolve, 1100));
            const metrics = manager.serializeMetrics(false);
            expect(metrics).toEqual({
                'system.cpu.usage': 75,
                'system.memory.usage': 1024,
                'system.cpu.{core:0}.usage': 80,
                'system.cpu.{core:1}.usage': 60,
                'system.network.{interface:eth0}.rate': 100,
                'system.network.{interface:wlan0}.rate': 50
            });
        });

        it('should serialize metrics with full info', async () => {
            // Wait for rate interval to complete
            await new Promise(resolve => setTimeout(resolve, 1100));
            const metrics = manager.serializeMetrics(true);
            expect(metrics).toMatchObject({
                'system.cpu.usage': {
                    name: 'system.cpu.usage',
                    type: 'gauge',
                    value: 75
                },
                'system.memory.usage': {
                    name: 'system.memory.usage',
                    type: 'gauge',
                    value: 1024
                },
                'system.cpu.{core:0}.usage': {
                    name: 'system.cpu.{core:0}.usage',
                    type: 'gauge',
                    value: 80
                },
                'system.cpu.{core:1}.usage': {
                    name: 'system.cpu.{core:1}.usage',
                    type: 'gauge',
                    value: 60
                },
                'system.network.{interface:eth0}.rate': {
                    name: 'system.network.{interface:eth0}.rate',
                    type: 'rate',
                    value: 100
                },
                'system.network.{interface:wlan0}.rate': {
                    name: 'system.network.{interface:wlan0}.rate',
                    type: 'rate',
                    value: 50
                }
            });
        });

        it('should filter parameterized metrics', async () => {
            // Wait for rate interval to complete
            await new Promise(resolve => setTimeout(resolve, 1100));
            const metrics = manager.serializeMetrics(false, { interface: 'eth0' });
            expect(metrics).toEqual({
                'system.network.{interface:eth0}.rate': 100
            });
        });
    });

    describe('dispose', () => {
        it('should dispose all metrics', () => {
            // Setup some test metrics
            const cpuUsage = manager.registerMetric('system.cpu.usage', GaugeSlot);
            const cpuCoreUsage = manager.registerParameterized('system.cpu.{core}.usage', GaugeSlot);
            cpuCoreUsage.registerMetric({ core: '0' });

            // Dispose all metrics
            manager.dispose();

            // Verify metrics were cleared
            expect(manager.getMetric('system.cpu.usage')).toBeUndefined();
            expect(manager.getMetric('system.cpu.{core:0}.usage')).toBeUndefined();

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith('Cleared all metrics');
        });
    });
});
