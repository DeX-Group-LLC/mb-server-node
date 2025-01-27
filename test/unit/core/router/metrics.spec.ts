import { MonitoringManager } from '@core/monitoring/manager';
import { RouterMetrics } from '@core/router/metrics';
import { AverageSlot, GaugeSlot, MaximumSlot, RateSlot } from '@core/monitoring/metrics/slots';

describe('RouterMetrics', () => {
    let monitoringManager: MonitoringManager;
    let metrics: RouterMetrics;

    beforeEach(() => {
        monitoringManager = new MonitoringManager();
        metrics = new RouterMetrics(monitoringManager);
    });

    afterEach(() => {
        metrics.dispose();
    });

    it('should register all metrics with correct types', () => {
        // Message metrics
        expect(metrics.messageCount['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.messageRate['slot']).toBeInstanceOf(RateSlot);
        expect(metrics.messageCountError['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.messageRateError['slot']).toBeInstanceOf(RateSlot);
        expect(metrics.messageSizeAvg['slot']).toBeInstanceOf(AverageSlot);
        expect(metrics.messageSizeMax['slot']).toBeInstanceOf(MaximumSlot);

        // Publish metrics
        expect(metrics.publishCount['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.publishCountError['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.publishRate['slot']).toBeInstanceOf(RateSlot);

        // Request metrics
        expect(metrics.requestCount['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.requestCountDropped['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.requestCountError['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.requestCountTimeout['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.requestRate['slot']).toBeInstanceOf(RateSlot);

        // Response metrics
        expect(metrics.responseCount['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.responseCountError['slot']).toBeInstanceOf(GaugeSlot);
        expect(metrics.responseRate['slot']).toBeInstanceOf(RateSlot);
    });

    it('should register all metrics with correct names', () => {
        const registeredMetrics = monitoringManager['metrics'];

        // Message metrics
        expect(registeredMetrics.has('router.message.count')).toBe(true);
        expect(registeredMetrics.has('router.message.rate')).toBe(true);
        expect(registeredMetrics.has('router.message.count.error')).toBe(true);
        expect(registeredMetrics.has('router.message.rate.error')).toBe(true);
        expect(registeredMetrics.has('router.message.size.avg')).toBe(true);
        expect(registeredMetrics.has('router.message.size.max')).toBe(true);

        // Publish metrics
        expect(registeredMetrics.has('router.publish.count')).toBe(true);
        expect(registeredMetrics.has('router.publish.count.error')).toBe(true);
        expect(registeredMetrics.has('router.publish.rate')).toBe(true);

        // Request metrics
        expect(registeredMetrics.has('router.request.count')).toBe(true);
        expect(registeredMetrics.has('router.request.count.dropped')).toBe(true);
        expect(registeredMetrics.has('router.request.count.error')).toBe(true);
        expect(registeredMetrics.has('router.request.count.timeout')).toBe(true);
        expect(registeredMetrics.has('router.request.rate')).toBe(true);

        // Response metrics
        expect(registeredMetrics.has('router.response.count')).toBe(true);
        expect(registeredMetrics.has('router.response.count.error')).toBe(true);
        expect(registeredMetrics.has('router.response.rate')).toBe(true);
    });

    it('should dispose all metrics', () => {
        const registeredMetrics = monitoringManager['metrics'];
        metrics.dispose();

        // Message metrics
        expect(registeredMetrics.has('router.message.count')).toBe(false);
        expect(registeredMetrics.has('router.message.rate')).toBe(false);
        expect(registeredMetrics.has('router.message.count.error')).toBe(false);
        expect(registeredMetrics.has('router.message.rate.error')).toBe(false);
        expect(registeredMetrics.has('router.message.size.avg')).toBe(false);
        expect(registeredMetrics.has('router.message.size.max')).toBe(false);

        // Publish metrics
        expect(registeredMetrics.has('router.publish.count')).toBe(false);
        expect(registeredMetrics.has('router.publish.count.error')).toBe(false);
        expect(registeredMetrics.has('router.publish.rate')).toBe(false);

        // Request metrics
        expect(registeredMetrics.has('router.request.count')).toBe(false);
        expect(registeredMetrics.has('router.request.count.dropped')).toBe(false);
        expect(registeredMetrics.has('router.request.count.error')).toBe(false);
        expect(registeredMetrics.has('router.request.count.timeout')).toBe(false);
        expect(registeredMetrics.has('router.request.rate')).toBe(false);

        // Response metrics
        expect(registeredMetrics.has('router.response.count')).toBe(false);
        expect(registeredMetrics.has('router.response.count.error')).toBe(false);
        expect(registeredMetrics.has('router.response.rate')).toBe(false);
    });
});