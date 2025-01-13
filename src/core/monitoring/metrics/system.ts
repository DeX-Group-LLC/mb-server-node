import { MonitoringManager } from '@core/monitoring/manager';
import { GaugeSlot, UptimeSlot } from '@core/monitoring/metrics/slots';
import { Metric } from '@core/monitoring/metrics/metric';
import { ParameterizedMetric } from '@core/monitoring/metrics/parameterized';

/**
 * Metrics for tracking system-level statistics like CPU, memory, and uptime
 */
export class SystemMetrics {
    /** Percentage of total CPU utilized (0-1) */
    public readonly cpuPercent: Metric<GaugeSlot>;

    /** Percentage of individual CPU cores utilized (0-1) */
    public readonly cpuCorePercent: ParameterizedMetric<GaugeSlot>;

    /** Memory percentage of host used (0-1) */
    public readonly memoryPercent: Metric<GaugeSlot>;

    /** Memory used total (MB) */
    public readonly memoryUsage: Metric<GaugeSlot>;

    /** Uptime of the Message Broker (seconds) */
    public readonly uptime: Metric<UptimeSlot>;

    constructor(private readonly monitoringManager: MonitoringManager) {
        this.cpuPercent = this.monitoringManager.registerMetric('system.cpu.percent', GaugeSlot);
        this.cpuCorePercent = this.monitoringManager.registerParameterized('system.cpu.{core}.percent', GaugeSlot);
        this.memoryPercent = this.monitoringManager.registerMetric('system.memory.percent', GaugeSlot);
        this.memoryUsage = this.monitoringManager.registerMetric('system.memory.usage', GaugeSlot);
        this.uptime = this.monitoringManager.registerMetric('system.uptime', UptimeSlot);
    }

    /**
     * Dispose of all system metrics
     */
    public dispose(): void {
        this.cpuPercent.dispose();
        this.cpuCorePercent.dispose();
        this.memoryPercent.dispose();
        this.memoryUsage.dispose();
        this.uptime.dispose();
    }
}