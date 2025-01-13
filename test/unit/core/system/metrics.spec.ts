import { MonitoringManager } from '@core/monitoring/manager';
import { SystemMetrics } from '@core/system/metrics';
import { GaugeSlot, UptimeSlot, PercentSlot } from '@core/monitoring/metrics/slots';

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
        expect(systemMetrics.cpuPercent.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.cpuCorePercent.getMetricByParams({ core: '0' })?.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.memoryPercent.slot).toBeInstanceOf(PercentSlot);
        expect(systemMetrics.memoryUsage.slot).toBeInstanceOf(GaugeSlot);
        expect(systemMetrics.uptime.slot).toBeInstanceOf(UptimeSlot);
    });

    it('should register metrics with correct names', () => {
        expect(systemMetrics.cpuPercent.name).toBe('system.cpu.percent');
        expect(systemMetrics.cpuCorePercent.template).toBe('system.cpu.{core}.percent');
        expect(systemMetrics.memoryPercent.name).toBe('system.memory.percent');
        expect(systemMetrics.memoryUsage.name).toBe('system.memory.usage');
        expect(systemMetrics.uptime.name).toBe('system.uptime');
    });

    it('should properly dispose all metrics', () => {
        const disposeSpy = jest.spyOn(systemMetrics.cpuPercent, 'dispose');
        systemMetrics.dispose();
        expect(disposeSpy).toHaveBeenCalled();
    });
});