import { RateSlot } from '@core/monitoring/metrics/slots';

// Clean up RateSlot interval after all tests
afterAll(() => {
    RateSlot.cleanup();
});