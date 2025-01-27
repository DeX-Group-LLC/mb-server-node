import { MonitoringManager } from '@core/monitoring';
import { RegistryMetrics } from '@core/registry/metrics';
import { GaugeSlot, RateSlot, UptimeSlot } from '@core/monitoring/metrics/slots';

describe('RegistryMetrics', () => {
    let monitoringManager: MonitoringManager;
    let metrics: RegistryMetrics;

    beforeEach(() => {
        monitoringManager = new MonitoringManager();
        metrics = new RegistryMetrics(monitoringManager);
    });

    afterEach(() => {
        metrics.dispose();
    });

    it('should register all required metrics', () => {
        // Verify count metric
        expect(metrics.count.name).toBe('registry.count');
        expect(metrics.count.slot).toBeInstanceOf(GaugeSlot);

        // Verify rate metrics
        expect(metrics.registrationRate.name).toBe('registry.registration.rate');
        expect(metrics.registrationRate.slot).toBeInstanceOf(RateSlot);

        expect(metrics.unregistrationRate.name).toBe('registry.unregistration.rate');
        expect(metrics.unregistrationRate.slot).toBeInstanceOf(RateSlot);

        expect(metrics.discoveryRate.name).toBe('registry.discovery.rate');
        expect(metrics.discoveryRate.slot).toBeInstanceOf(RateSlot);

        // Verify parameterized metrics
        expect(metrics.serviceErrorRate).toBeDefined();
        const errorRateMetric = metrics.serviceErrorRate.registerMetric({ serviceId: 'test' });
        expect(errorRateMetric.slot).toBeInstanceOf(RateSlot);

        expect(metrics.serviceUptime).toBeDefined();
        const uptimeMetric = metrics.serviceUptime.registerMetric({ serviceId: 'test' });
        expect(uptimeMetric.slot).toBeInstanceOf(UptimeSlot);
    });

    it('should properly dispose all metrics', () => {
        // Register some metrics
        const errorRateMetric = metrics.serviceErrorRate.registerMetric({ serviceId: 'test' });
        const uptimeMetric = metrics.serviceUptime.registerMetric({ serviceId: 'test' });

        // Spy on dispose methods
        const countDisposeSpy = jest.spyOn(metrics.count, 'dispose');
        const registrationRateDisposeSpy = jest.spyOn(metrics.registrationRate, 'dispose');
        const unregistrationRateDisposeSpy = jest.spyOn(metrics.unregistrationRate, 'dispose');
        const discoveryRateDisposeSpy = jest.spyOn(metrics.discoveryRate, 'dispose');
        const serviceErrorRateDisposeSpy = jest.spyOn(metrics.serviceErrorRate, 'dispose');
        const serviceUptimeDisposeSpy = jest.spyOn(metrics.serviceUptime, 'dispose');

        // Dispose metrics
        metrics.dispose();

        // Verify all metrics were disposed
        expect(countDisposeSpy).toHaveBeenCalled();
        expect(registrationRateDisposeSpy).toHaveBeenCalled();
        expect(unregistrationRateDisposeSpy).toHaveBeenCalled();
        expect(discoveryRateDisposeSpy).toHaveBeenCalled();
        expect(serviceErrorRateDisposeSpy).toHaveBeenCalled();
        expect(serviceUptimeDisposeSpy).toHaveBeenCalled();
    });

    it('should track metric values correctly', async () => {
        // Test count metric
        metrics.count.slot.set(5);
        expect(metrics.count.slot.value).toBe(5);

        // Test rate metrics
        metrics.registrationRate.slot.add(1);
        metrics.unregistrationRate.slot.add(1);
        metrics.discoveryRate.slot.add(1);

        // Wait for rate calculation (default interval is 1 second)
        await new Promise(resolve => setTimeout(resolve, 1100));

        expect(metrics.registrationRate.slot.value).toBeGreaterThan(0);
        expect(metrics.unregistrationRate.slot.value).toBeGreaterThan(0);
        expect(metrics.discoveryRate.slot.value).toBeGreaterThan(0);

        // Test parameterized metrics
        const serviceId = 'test-service';
        const errorRateMetric = metrics.serviceErrorRate.registerMetric({ serviceId });
        errorRateMetric.slot.add(1);
        await new Promise(resolve => setTimeout(resolve, 1100));
        expect(errorRateMetric.slot.value).toBeGreaterThan(0);

        const uptimeMetric = metrics.serviceUptime.registerMetric({ serviceId });
        expect(uptimeMetric.slot).toBeInstanceOf(UptimeSlot);
        expect(uptimeMetric.slot.value).toBeDefined();
    }, 5000); // Increase timeout to account for delays
});
