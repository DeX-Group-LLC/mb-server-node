import { MonitoringManager } from '@core/monitoring/manager';
import { GaugeSlot, UptimeSlot, PercentSlot } from '@core/monitoring/metrics/slots';
import { Metric } from '@core/monitoring/metrics/metric';
import { ParameterizedMetric } from '@core/monitoring/metrics/parameterized';

/**
 * Metrics for tracking system-level statistics like CPU, memory, and uptime
 */
export class SystemMetrics {
    /** Process CPU usage as percentage (0-1) */
    public readonly processCpuUsage: Metric<PercentSlot>;

    /** Process memory usage in bytes (heap + external) */
    public readonly processMemoryBytes: Metric<GaugeSlot>;

    /** Process memory usage as percentage of total system memory (0-1) */
    public readonly processMemoryPercent: Metric<PercentSlot>;

    /** Uptime of the Message Broker (seconds) */
    public readonly processUptime: Metric<UptimeSlot>;

    /** Percentage of total CPU utilized (0-1) */
    public readonly systemCpuPercent: Metric<PercentSlot>;

    /** Percentage of individual CPU cores utilized (0-1) */
    public readonly systemCpuCorePercent: ParameterizedMetric<PercentSlot>;

    /** Memory used total (bytes) */
    public readonly systemMemoryBytes: Metric<GaugeSlot>;

    /** Memory percentage of host used (0-1) */
    public readonly systemMemoryPercent: Metric<PercentSlot>;

    /** Uptime of the host (seconds) */
    public readonly systemUptime: Metric<UptimeSlot>;

    constructor(private readonly monitoringManager: MonitoringManager) {
        this.processCpuUsage = this.monitoringManager.registerMetric('process.cpu.percent', PercentSlot);
        this.processMemoryBytes = this.monitoringManager.registerMetric('process.memory.bytes', GaugeSlot);
        this.processMemoryPercent = this.monitoringManager.registerMetric('process.memory.percent', PercentSlot);
        this.processUptime = this.monitoringManager.registerMetric('process.uptime', UptimeSlot);
        this.systemCpuPercent = this.monitoringManager.registerMetric('system.cpu.percent', PercentSlot);
        this.systemCpuCorePercent = this.monitoringManager.registerParameterized('system.cpu.{core}.percent', PercentSlot);
        this.systemMemoryBytes = this.monitoringManager.registerMetric('system.memory.bytes', GaugeSlot);
        this.systemMemoryPercent = this.monitoringManager.registerMetric('system.memory.percent', PercentSlot);
        this.systemUptime = this.monitoringManager.registerMetric('system.uptime', UptimeSlot);
    }

    /**
     * Dispose of all system metrics
     */
    public dispose(): void {
        this.systemCpuPercent.dispose();
        this.systemCpuCorePercent.dispose();
        this.systemMemoryBytes.dispose();
        this.systemMemoryPercent.dispose();
        this.processCpuUsage.dispose();
        this.processMemoryBytes.dispose();
        this.processMemoryPercent.dispose();
        this.processUptime.dispose();
    }
}