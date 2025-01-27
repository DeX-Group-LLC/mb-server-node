import { MetricsContainer, MonitoringManager } from '@core/monitoring';
import { Metric, ParameterizedMetric } from '@core/monitoring/metrics';
import { GaugeSlot, RateSlot, UptimeSlot } from '@core/monitoring/metrics/slots';

/**
 * Metrics for the Registry module
 */
export class RegistryMetrics implements MetricsContainer {
    /** Total number of registered services */
    public readonly count: Metric<GaugeSlot>;

    /** Rate of service registrations */
    public readonly registrationRate: Metric<RateSlot>;

    /** Rate of service discovery requests */
    public readonly discoveryRate: Metric<RateSlot>;

    /** Rate of service unregistrations */
    public readonly unregistrationRate: Metric<RateSlot>;

    /** Rate of errors generated by a specific service */
    public readonly serviceErrorRate: ParameterizedMetric<RateSlot>;

    /** Uptime of a specific service */
    public readonly serviceUptime: ParameterizedMetric<UptimeSlot>;

    constructor(private readonly monitoringManager: MonitoringManager) {
        // Initialize all metrics
        this.count = this.monitoringManager.registerMetric('registry.count', GaugeSlot);
        this.discoveryRate = this.monitoringManager.registerMetric('registry.discovery.rate', RateSlot);
        this.registrationRate = this.monitoringManager.registerMetric('registry.registration.rate', RateSlot);
        this.serviceErrorRate = this.monitoringManager.registerParameterized('registry.service.{serviceid}.error.rate', RateSlot);
        this.serviceUptime = this.monitoringManager.registerParameterized('registry.service.{serviceid}.uptime', UptimeSlot);
        this.unregistrationRate = this.monitoringManager.registerMetric('registry.unregistration.rate', RateSlot);
    }

    /**
     * Dispose of all metrics
     */
    public dispose(): void {
        // Dispose of all metrics
        this.count.dispose();
        this.discoveryRate.dispose();
        this.registrationRate.dispose();
        this.serviceErrorRate.dispose();
        this.serviceUptime.dispose();
        this.unregistrationRate.dispose();
    }
}