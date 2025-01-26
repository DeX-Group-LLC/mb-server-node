import { MonitoringManager } from '@core/monitoring/manager';
import { SystemMetrics } from '@core/system/metrics';
import { GaugeSlot, PercentSlot, UptimeSlot } from '@core/monitoring/metrics/slots';

describe('SystemMetrics', () => {
    let monitoringManager: MonitoringManager;
    let systemMetrics: SystemMetrics;

    beforeEach(() => {
        monitoringManager = new MonitoringManager();
        systemMetrics = new SystemMetrics(monitoringManager);
    });

    afterEach(() => {
        systemMetrics.dispose();
    });

    it('should register all system metrics with correct types', () => {
        expect(systemMetrics.processCpuUsage.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.processMemoryBytes.slot).toBeInstanceOf(GaugeSlot);
        expect(systemMetrics.processMemoryPercent.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.processUptime.slot).toBeInstanceOf(UptimeSlot);
        expect(systemMetrics.systemCpuPercent.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.systemMemoryBytes.slot).toBeInstanceOf(GaugeSlot);
        expect(systemMetrics.systemMemoryPercent.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.systemUptime.slot).toBeInstanceOf(UptimeSlot);

        // For parameterized metrics, we need to register a metric first
        const coreMetric = systemMetrics.systemCpuCorePercent.registerMetric({ core: '0' });
        expect(coreMetric.slot).toBeInstanceOf(PercentSlot);
    });

    it('should register metrics with correct names', () => {
        expect(systemMetrics.processCpuUsage.name).toBe('process.cpu.percent');
        expect(systemMetrics.processMemoryBytes.name).toBe('process.memory.bytes');
        expect(systemMetrics.processMemoryPercent.name).toBe('process.memory.percent');
        expect(systemMetrics.processUptime.name).toBe('process.uptime');
        expect(systemMetrics.systemCpuPercent.name).toBe('system.cpu.percent');
        expect(systemMetrics.systemCpuCorePercent.template).toBe('system.cpu.{core}.percent');
        expect(systemMetrics.systemMemoryBytes.name).toBe('system.memory.bytes');
        expect(systemMetrics.systemMemoryPercent.name).toBe('system.memory.percent');
        expect(systemMetrics.systemUptime.name).toBe('system.uptime');
    });

    it('should properly dispose all metrics', () => {
        const disposeSpy = jest.spyOn(systemMetrics.processCpuUsage, 'dispose');
        systemMetrics.dispose();
        expect(disposeSpy).toHaveBeenCalled();
    });
});