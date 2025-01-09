import { EventEmitter } from 'events';
import { InternalError } from '@core/errors';
import { Metric } from './metric';
import { IReadOnlySlot, IManageableSlot, RateSlot } from './slots';
import { BaseSlot } from './slots/base';

// Regex for validating metric templates with parameters
const METRIC_TEMPLATE_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*|\.\{[a-z]+\}){0,4}$/;

// Regex for validating a parameterized metric value - allows any chars except : and }
const PARAM_VALUE_REGEX = /^[^:}]+$/;

/**
 * Result of extracting template and parameters from a parameterized name.
 */
export interface ExtractResult {
    template: string;
    params: Record<string, string>;
}

/**
 * A metric template that supports parameterized names, automatically managing separate
 * metric instances for each parameter combination.
 *
 * Example:
 * ```typescript
 * const metric = new ParameterizedMetric('router.message.rate.{topic}', manager);
 * metric.getMetric({ topic: 'events.europe' }).set(1);  // Creates metric 'router.message.rate.{topic:events.europe}'
 * ```
 */
export class ParameterizedMetric<TSlot extends BaseSlot = IManageableSlot> extends EventEmitter {
    private pattern: RegExp;
    private metrics = new Map<string, Metric<TSlot>>();

    /**
     * Creates a new parameterized metric template.
     * @param template - The metric name template (e.g. 'system.cpu.{core}.usage')
     */
    constructor(
        private _template: string,
        private _slotClass: new () => TSlot
    ) {
        super();

        // Canonicalize first, then validate
        this._template = ParameterizedMetric.getCanonicalName(this._template);
        if (!this.isValidTemplate()) {
            throw new InternalError('Invalid metric template', { template: this.template });
        }

        // Convert template to regex pattern that matches all metrics created from it
        // e.g., 'system.cpu.{core}.usage' -> /^system\.cpu\.\{core:[^:}]+\}\.usage$/
        const pattern = this.template
            .replace(/\./g, '\\.')
            .replace(/\{([a-z]+)\}/g, '\\{$1:[^:}]+\\}');
        this.pattern = new RegExp(`^${pattern}$`);
    }

    /**
     * Extracts the template and parameter values from a parameterized metric name.
     * For example: 'system.cpu.{core:0}.usage' -> { template: 'system.cpu.{core}.usage', params: { core: '0' } }
     *
     * @param name - The parameterized metric name to extract from
     * @returns The template and parameter values
     * @throws If the name is not a valid parameterized metric name
     */
    static extract(name: string): ExtractResult {
        const params: Record<string, string> = {};

        // Replace all parameter values with placeholders, collecting values as we go
        const template = name.replace(/\{([a-z]+):([^:}]+)\}/g, (_, param, value) => {
            params[param] = value;
            return `{${param}}`;
        });

        // If no parameters were found, or the result isn't a valid template, return undefined
        if (Object.keys(params).length === 0 || !METRIC_TEMPLATE_REGEX.test(template)) {
            throw new InternalError('Invalid metric template', { template });
        }

        return { template, params };
    }

    /**
     * Validates that the metric name follows template naming conventions.
     * A valid template must:
     * - Be a string with a maximum length of 255 characters
     * - Start with a letter
     * - Each segment must be either:
     *   - Letters and numbers only
     *   - A parameter placeholder in the format {param} where param contains only letters
     * - Follow a hierarchical structure using dots as separators
     * - Have a maximum depth of 5 levels
     * - Not contain consecutive dots
     * - Not start or end with a dot
     *
     * @returns True if the metric name is a valid template, false otherwise.
     */
    private isValidTemplate(): boolean {
        return this.template.length <= 255 && METRIC_TEMPLATE_REGEX.test(this.template) && ParameterizedMetric.isParameterized(this.template);
    }

    /**
     * Converts a metric name to its canonical form (lowercase).
     */
    static getCanonicalName(name: string): string {
        return name.toLowerCase();
    }

    /**
     * Checks if a metric name is a parameterized metric.
     * @param name - The metric name to check
     * @returns True if the metric name is a parameterized metric, false otherwise
     */
    static isParameterized(name: string): boolean {
        // Check if has at least one parameter
        return name.includes('{') || name.includes('}');
    }

    /**
     * Gets the template string for this parameterized metric.
     */
    get template(): string {
        return this._template;
    }

    /**
     * Serializes a parameterized metric name with its values.
     * For example: "router.message.rate.{topic}" with value "events.eu" becomes
     * "router.message.rate.{topic:events.eu}"
     */
    private serializeMetricName(params: Record<string, string>): string {
        // Convert params to lowercase to match case insensitive lookup
        params = Object.fromEntries(Object.entries(params).map(([key, value]) => [key.toLowerCase(), value]));
        return this.template.replace(/\{([a-z]+)\}/g, (_, param) => {
            const value = params[param];
            if (!value) throw new InternalError(`Missing value for parameter ${param}`, { param });
            if (!PARAM_VALUE_REGEX.test(value)) {
                throw new InternalError(`Invalid parameter value: ${value}`, { param, value });
            }
            // Note: No need to validate param name here as it was already validated
            // by METRIC_TEMPLATE_REGEX in the constructor. Any param names in the template
            // are guaranteed to be valid (lowercase letters only).
            return `{${param}:${value}}`;
        });
    }

    /**
     * Gets or creates a metric for the given parameter values.
     *
     * @param params - Object of parameter names to values
     * @returns The metric instance
     */
    getMetric(params: Record<string, string> | string): Metric<TSlot> | undefined {
        return typeof params === 'string' ? this.getMetricByName(params) : this.getMetricByParams(params);
    }

    /**
     * Gets or creates a metric by its full parameterized name.
     * The name must match this template's pattern.
     *
     * @param name - The full parameterized name (e.g., 'system.cpu.{core:0}.usage')
     * @returns The metric instance
     * @throws If the name doesn't match this template's pattern
     */
    getMetricByName(name: string): Metric<TSlot> | undefined {
        const canonicalName = Metric.getCanonicalName(name);
        if (!this.pattern.test(canonicalName)) {
            throw new InternalError('Metric name does not match template pattern', {
                name: canonicalName,
                template: this.template
            });
        }

        return this.metrics.get(canonicalName);
    }

    /**
     * Gets a metric by its parameter values.
     *
     * @param params - Object of parameter names to values
     * @returns The metric instance or undefined if not found
     */
    getMetricByParams(params: Record<string, string>): Metric<TSlot> | undefined {
        return this.metrics.get(this.serializeMetricName(params));
    }

    /**
     * Creates a new metric with the given parameter values.
     *
     * @param params - Object of parameter names to values
     * @returns The created metric
     * @throws If a metric with these parameters already exists
     */
    registerMetric(params: Record<string, string>): Metric<TSlot> {
        const name = this.serializeMetricName(params);

        // Check if metric already exists
        if (this.metrics.has(name)) {
            throw new InternalError(`Metric ${name} already exists`);
        }

        // Create a new metric instance
        const metric = new Metric(name, this._slotClass);
        this.metrics.set(name, metric);

        // Listen for disposal
        metric.once('dispose', () => {
            this.metrics.delete(name);
        });

        return metric;
    }

    /**
     * Tests if a metric name matches this template's pattern.
     * For example, if the template is 'system.cpu.{core}.usage',
     * this will return true for names like 'system.cpu.{core:0}.usage'.
     */
    matches(template: string): boolean {
        const canonicalTemplate = ParameterizedMetric.getCanonicalName(template);
        return this.pattern.test(canonicalTemplate);
    }

    /**
     * Gets all metrics registered for this template.
     */
    get allMetrics(): IterableIterator<Metric<TSlot>> {
        return this.metrics.values();
    }

    /**
     * Disposes this parameterized metric and all metrics created from it.
     * Emits a 'dispose' event that MonitoringManager can listen to.
     */
    dispose(): void {
        // Dispose all metrics
        for (const metric of this.metrics.values()) {
            metric.dispose();
        }

        // Clear all metrics
        this.metrics.clear();

        // Emit dispose event
        this.emit('dispose', this);
    }
}