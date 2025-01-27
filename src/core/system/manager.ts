import os from 'os';
import { MonitoringManager } from '@core/monitoring/manager';
import { SetupLogger } from '@utils/logger';
import { SystemMetrics } from './metrics';

const logger = SetupLogger('SubscriptionManager');

/**
 * Manages system-level operations and monitoring
 */
export class SystemManager {
    private readonly metrics: SystemMetrics;
    private updateInterval: NodeJS.Timeout | null = null;
    private lastProcessCpuUsage: { user: number; system: number } | null = null;
    private lastProcessCpuUsageTime: number | null = null;
    private previousCPUTimes: { idle: number; total: number }[] | null = null;

    constructor(private readonly monitoringManager: MonitoringManager) {
        this.metrics = new SystemMetrics(monitoringManager);
        this.start();
    }

    /**
     * Start collecting system metrics
     * @param intervalMs The interval in milliseconds to collect metrics (default: 1000)
     */
    public start(intervalMs: number = 1000): void {
        // Stop any existing interval
        if (this.updateInterval) this.dispose();

        // Set the uptime metrics
        const systemBootTime = new Date(Date.now() - (os.uptime() * 1000));
        this.metrics.systemUptime.slot.set(systemBootTime);
        this.metrics.processUptime.slot.set(new Date());

        // Start periodic collection
        this.updateInterval = setInterval(() => {
            this.collectMetrics();
        }, intervalMs);

        // Collect initial metrics
        this.collectMetrics();
    }

    /**
     * Stop collecting system metrics
     */
    public stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Collect current system metrics
     */
    private collectMetrics(): void {
        // System CPU metrics
        const cpus = os.cpus();
        const cpuUsage = this.calculateCPUUsage(cpus);
        this.metrics.systemCpuPercent.slot.set(cpuUsage.total);

        cpuUsage.cores.forEach((usage, index) => {
            let metric = this.metrics.systemCpuCorePercent.getMetricByParams({ core: index.toString() });
            if (!metric) {
                metric = this.metrics.systemCpuCorePercent.registerMetric({ core: index.toString() });
            }
            metric.slot.set(usage);
        });

        // System memory metrics
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        this.metrics.systemMemoryPercent.slot.set(usedMem / totalMem);
        this.metrics.systemMemoryBytes.slot.set(usedMem);

        // Process Memory Usage
        const memoryUsage = process.memoryUsage();
        this.metrics.processMemoryBytes.slot.set(memoryUsage.heapUsed + memoryUsage.external);
        this.metrics.processMemoryPercent.slot.set((memoryUsage.heapUsed + memoryUsage.external) / totalMem);

        // Process CPU Usage
        const currentCpuUsage = process.cpuUsage();
        const now = process.hrtime.bigint();

        if (this.lastProcessCpuUsage && this.lastProcessCpuUsageTime) {
            const userDiff = currentCpuUsage.user - this.lastProcessCpuUsage.user;
            const systemDiff = currentCpuUsage.system - this.lastProcessCpuUsage.system;

            // Convert from nanoseconds to seconds
            const timeDiffSeconds = Number(now - BigInt(this.lastProcessCpuUsageTime)) / 1e9;

            // Calculate percentage (userDiff and systemDiff are in microseconds)
            const totalCpuTime = (userDiff + systemDiff) / 1000; // Convert to milliseconds
            const cpuPercent = (totalCpuTime / (timeDiffSeconds * 1000)) / os.cpus().length;

            this.metrics.processCpuUsage.slot.set(cpuPercent);
        }

        this.lastProcessCpuUsage = currentCpuUsage;
        this.lastProcessCpuUsageTime = Number(now);
    }

    /**
     * Calculate CPU usage as a percentage (0-1)
     */
    private calculateCPUUsage(cpus: os.CpuInfo[]): { total: number; cores: number[] } {
        const currentTimes = cpus.map(cpu => ({
            idle: cpu.times.idle,
            total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
        }));

        // First run - just store the values and return 0
        if (!this.previousCPUTimes) {
            this.previousCPUTimes = currentTimes;
            return { total: 0, cores: new Array(cpus.length).fill(0) };
        }

        // Calculate usage based on differences
        const cores = currentTimes.map((current, index) => {
            const previous = this.previousCPUTimes![index];
            const idleDiff = current.idle - previous.idle;
            const totalDiff = current.total - previous.total;
            return totalDiff === 0 ? 0 : 1 - (idleDiff / totalDiff);
        });

        // Store current times for next calculation
        this.previousCPUTimes = currentTimes;

        const total = cores.reduce((acc, usage) => acc + usage, 0) / cores.length;
        return { total, cores };
    }

    /**
     * Dispose of system manager and its resources
     */
    public dispose(): void {
        this.stop();
        this.metrics.dispose();
        logger.info('Cleared all system metrics');
    }
}