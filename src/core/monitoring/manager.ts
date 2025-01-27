import { InternalError } from '@core/errors';
import { SetupLogger } from '@utils/logger';
import { Metric, ParameterizedMetric } from './metrics';
import { BaseSlot, IReadOnlySlot } from './metrics/slots';

const logger = SetupLogger('MonitoringManager');

export interface MetricInfo {
    name: string;
    type: string;
    timestamp: string;
    value: number;
}

/**
 * Manages all metrics in the application, providing registration and lookup functionality.
 * Metric names follow topic naming conventions (e.g., 'system.cpu.usage').
 * Parameterized metrics are created by registering a template (e.g., 'system.cpu.{core}.usage')
 */
export class MonitoringManager {
    private metrics = new Map<string, Metric>();
    private parameterizedMetrics = new Map<string, ParameterizedMetric>();

    /**
     * Creates and registers a new metric with the given name.
     *
     * @param name - The name for the metric
     * @param SlotClass - Slot type to use for this metric
     * @returns The created metric
     * @throws If a metric with the same name already exists
     */
    registerMetric<TSlot extends BaseSlot>(name: string, SlotClass: new () => TSlot): Metric<TSlot> {
        const canonicalName = Metric.getCanonicalName(name);

        // Check if this is a parameterized metric
        if (ParameterizedMetric.isParameterized(canonicalName)) {
            throw new InternalError(
                'Cannot create parameterized metrics directly. Use registerParameterized() to create a template first.',
                { name }
            );
        }

        // Check if metric already exists
        if (this.metrics.has(canonicalName)) {
            throw new InternalError(`Metric ${name} already exists`);
        }

        // Create and register the slot
        const metric = new Metric(canonicalName, SlotClass);
        this.metrics.set(canonicalName, metric);

        // Listen for dispose events
        metric.on('dispose', () => {
            this.metrics.delete(canonicalName);
        });

        return metric;
    }

    /**
     * Creates and registers a new parameterized metric with the given name.
     * The name must include parameter values (e.g., 'system.cpu.{core:0}.usage').
     *
     * @param name - The parameterized name for the metric
     * @returns The created parameterized metric
     */
    registerParameterized<TSlot extends BaseSlot>(name: string, SlotClass: new () => TSlot): ParameterizedMetric<TSlot> {
        const canonicalName = ParameterizedMetric.getCanonicalName(name);

        // Check if parameterized metric already exists
        if (this.parameterizedMetrics.has(canonicalName)) {
            throw new InternalError(`Parameterized metric ${name} already exists`);
        }

        // Create and register the parameterized metric
        const metric = new ParameterizedMetric(name, SlotClass);
        this.parameterizedMetrics.set(canonicalName, metric);

        // Listen for dispose events
        metric.on('dispose', () => {
            this.parameterizedMetrics.delete(canonicalName);
        });

        return metric;
    }

    /**
     * Gets a metric by its parameterized name.
     * Returns undefined if the metric doesn't exist.
     */
    getMetric(name: string): IReadOnlySlot | undefined {
        const canonicalName = Metric.getCanonicalName(name);

        // Check if this is a parameterized metric
        if (ParameterizedMetric.isParameterized(canonicalName)) {
            const extracted = ParameterizedMetric.extract(canonicalName);
            return this.parameterizedMetrics.get(extracted.template)?.getMetric(extracted.params)?.slot;
        }

        // Otherwise, return the metric
        return this.metrics.get(canonicalName)?.slot;
    }

    /**
     * Disposes of all metrics and parameterized metrics.
     */
    dispose(): void {
        // Dispose all parameterized metrics first
        for (const parameterized of this.parameterizedMetrics.values()) {
            parameterized.dispose();
        }

        // Dispose any remaining metrics
        for (const metric of this.metrics.values()) {
            metric.dispose();
        }

        // Clear the maps
        this.metrics.clear();
        this.parameterizedMetrics.clear();

        logger.info('Cleared all metrics');
    }

    /**
     * Serializes all metrics to a JSON object.
     * @returns A JSON object containing all metrics.
     */
    serializeMetrics(showAll: boolean, paramFilter?: Record<string, string>): Record<string, number> | Record<string, MetricInfo> {
        if (showAll) {
            const metrics: Record<string, MetricInfo> = {};
            // Skip regular metrics if we have a param filter
            if (!paramFilter) {
                // Serialize all metrics:
                for (const metric of this.metrics.values()) {
                    metrics[metric.name] = {
                        name: metric.name,
                        type: metric.slot.constructor.name.toLowerCase().replace('slot', ''),
                        timestamp: metric.slot.lastModified.toISOString(),
                        value: metric.slot.value
                    };
                }
            }
            // Serialize all parameterized metrics:
            for (const metric of this.parameterizedMetrics.values()) {
                // Get the iterator for the metrics
                const iter = paramFilter ? metric.filteredMetrics(paramFilter) : metric.allMetrics;
                // Serialize the metrics
                for (const metricInstance of iter) {
                    metrics[metricInstance.name] = {
                        name: metricInstance.name,
                        type: metricInstance.slot.constructor.name.toLowerCase().replace('slot', ''),
                        timestamp: metricInstance.slot.lastModified.toISOString(),
                        value: metricInstance.slot.value
                    };
                }
            }
            return metrics;
        } else {
            const metrics: Record<string, number> = {};
            // Skip regular metrics if we have a param filter
            if (!paramFilter) {
                // Serialize all metrics:
                for (const metric of this.metrics.values()) {
                    metrics[metric.name] = metric.slot.value;
                }
            }
            // Serialize all parameterized metrics:
            for (const metric of this.parameterizedMetrics.values()) {
                // Get the iterator for the metrics
                const iter = paramFilter ? metric.filteredMetrics(paramFilter) : metric.allMetrics;
                // Serialize the metrics
                for (const metricInstance of iter) {
                    metrics[metricInstance.name] = metricInstance.slot.value;
                }
            }
            return metrics;
        }
    }
}
