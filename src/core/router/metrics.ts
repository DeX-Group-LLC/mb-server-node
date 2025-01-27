import { MonitoringManager } from '@core/monitoring/manager';
import { Metric } from '@core/monitoring/metrics/metric';
import { AverageSlot, GaugeSlot, MaximumSlot, RateSlot } from '@core/monitoring/metrics/slots';

/**
 * Metrics for the Router module
 */
export class RouterMetrics {
    // Message metrics
    public readonly messageCount: Metric<GaugeSlot>;
    public readonly messageRate: Metric<RateSlot>;
    public readonly messageCountError: Metric<GaugeSlot>;
    public readonly messageRateError: Metric<RateSlot>;
    public readonly messageSizeAvg: Metric<AverageSlot>;
    public readonly messageSizeMax: Metric<MaximumSlot>;

    // Publish metrics
    public readonly publishCount: Metric<GaugeSlot>;
    public readonly publishCountDropped: Metric<GaugeSlot>;
    public readonly publishCountError: Metric<GaugeSlot>;
    public readonly publishRate: Metric<RateSlot>;
    public readonly publishRateDropped: Metric<RateSlot>;
    public readonly publishRateError: Metric<RateSlot>;

    // Request metrics
    public readonly requestCount: Metric<GaugeSlot>;
    public readonly requestCountDropped: Metric<GaugeSlot>;
    public readonly requestCountError: Metric<GaugeSlot>;
    public readonly requestCountTimeout: Metric<GaugeSlot>;
    public readonly requestRate: Metric<RateSlot>;
    public readonly requestRateDropped: Metric<RateSlot>;
    public readonly requestRateError: Metric<RateSlot>;
    public readonly requestRateTimeout: Metric<RateSlot>;

    // Response metrics
    public readonly responseCount: Metric<GaugeSlot>;
    public readonly responseCountError: Metric<GaugeSlot>;
    public readonly responseRate: Metric<RateSlot>;
    public readonly responseRateError: Metric<RateSlot>;

    constructor(private readonly monitoringManager: MonitoringManager) {
        // Message metrics
        this.messageCount = this.monitoringManager.registerMetric('router.message.count', GaugeSlot);
        this.messageRate = this.monitoringManager.registerMetric('router.message.rate', RateSlot);
        this.messageCountError = this.monitoringManager.registerMetric('router.message.count.error', GaugeSlot);
        this.messageRateError = this.monitoringManager.registerMetric('router.message.rate.error', RateSlot);
        this.messageSizeAvg = this.monitoringManager.registerMetric('router.message.size.avg', AverageSlot);
        this.messageSizeMax = this.monitoringManager.registerMetric('router.message.size.max', MaximumSlot);

        // Publish metrics
        this.publishCount = this.monitoringManager.registerMetric('router.publish.count', GaugeSlot);
        this.publishCountDropped = this.monitoringManager.registerMetric('router.publish.count.dropped', GaugeSlot);
        this.publishCountError = this.monitoringManager.registerMetric('router.publish.count.error', GaugeSlot);
        this.publishRate = this.monitoringManager.registerMetric('router.publish.rate', RateSlot);
        this.publishRateDropped = this.monitoringManager.registerMetric('router.publish.rate.dropped', RateSlot);
        this.publishRateError = this.monitoringManager.registerMetric('router.publish.rate.error', RateSlot);

        // Request metrics
        this.requestCount = this.monitoringManager.registerMetric('router.request.count', GaugeSlot);
        this.requestCountDropped = this.monitoringManager.registerMetric('router.request.count.dropped', GaugeSlot);
        this.requestCountError = this.monitoringManager.registerMetric('router.request.count.error', GaugeSlot);
        this.requestCountTimeout = this.monitoringManager.registerMetric('router.request.count.timeout', GaugeSlot);
        this.requestRate = this.monitoringManager.registerMetric('router.request.rate', RateSlot);
        this.requestRateDropped = this.monitoringManager.registerMetric('router.request.rate.dropped', RateSlot);
        this.requestRateError = this.monitoringManager.registerMetric('router.request.rate.error', RateSlot);
        this.requestRateTimeout = this.monitoringManager.registerMetric('router.request.rate.timeout', RateSlot);


        // Response metrics
        this.responseCount = this.monitoringManager.registerMetric('router.response.count', GaugeSlot);
        this.responseCountError = this.monitoringManager.registerMetric('router.response.count.error', GaugeSlot);
        this.responseRate = this.monitoringManager.registerMetric('router.response.rate', RateSlot);
        this.responseRateError = this.monitoringManager.registerMetric('router.response.rate.error', RateSlot);
    }

    /**
     * Dispose of all metrics
     */
    dispose(): void {
        // Message metrics
        this.messageCount.dispose();
        this.messageRate.dispose();
        this.messageCountError.dispose();
        this.messageRateError.dispose();
        this.messageSizeAvg.dispose();
        this.messageSizeMax.dispose();

        // Publish metrics
        this.publishCount.dispose();
        this.publishCountDropped.dispose();
        this.publishCountError.dispose();
        this.publishRate.dispose();
        this.publishRateDropped.dispose();
        this.publishRateError.dispose();

        // Request metrics
        this.requestCount.dispose();
        this.requestCountDropped.dispose();
        this.requestCountError.dispose();
        this.requestCountTimeout.dispose();
        this.requestRate.dispose();
        this.requestRateDropped.dispose();
        this.requestRateError.dispose();
        this.requestRateTimeout.dispose();

        // Response metrics
        this.responseCount.dispose();
        this.responseCountError.dispose();
        this.responseRate.dispose();
        this.responseRateError.dispose();
    }
}