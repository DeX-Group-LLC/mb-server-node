import { Metric } from './metrics/metric';

export * from './metrics/metric';
export * from './metrics/parameterized';
export * from './manager';
export * as Slots from './metrics/slots';

export interface MetricsContainer {
    dispose(): void;
}