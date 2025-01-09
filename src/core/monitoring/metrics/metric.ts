import { EventEmitter } from 'events';
import { InternalError } from '@core/errors';
import { BaseSlot, IManageableSlot, GaugeSlot } from './slots';

// Regex for validating metric names (supports parameterized names)
const METRIC_NAME_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*|\.\{[a-z]+:[^:}]+\}){0,4}$/;

/**
 * A metric that maintains a single value.
 * This is the primary metric type used for monitoring values.
 * TSlot is the type of slot that handles value storage and behavior
 */
export class Metric<TSlot extends BaseSlot = IManageableSlot> extends EventEmitter {
    /** The slot that handles value storage and behavior */
    private _slot: TSlot;

    /**
     * Creates a new metric.
     * @param name - The name of the metric (must be a parameterized name)
     * @param SlotClass - The type of slot to use for this metric. Defaults to BaseSlot.
     */
    constructor(
        protected _name: string,
        SlotClass: new () => TSlot
    ) {
        super();

        // Canonicalize first, then validate
        this._name = Metric.getCanonicalName(this._name);
        if (!this.isValidName()) {
            throw new InternalError('Invalid metric name', { name: this._name });
        }

        // Create the slot
        this._slot = new SlotClass();
    }

    /**
     * Validates that the metric name follows naming conventions.
     * A valid metric name must:
     * - Be a string with a maximum length of 255 characters
     * - Start with a letter
     * - Each segment must be either:
     *   - Letters and numbers only
     *   - A parameter in the format {param:value} where:
     *     - param contains only letters
     *     - value contains any characters except : and }
     * - Follow a hierarchical structure using dots as separators
     * - Have a maximum depth of 5 levels
     * - Not contain consecutive dots
     * - Not start or end with a dot
     */
    protected isValidName(): boolean {
        return this._name.length <= 255 && METRIC_NAME_REGEX.test(this._name);
    }

    /**
     * Converts a metric name to its canonical form (lowercase).
     */
    static getCanonicalName(name: string): string {
        return name.toLowerCase();
    }

    /**
     * Gets the name of the metric.
     */
    get name(): string {
        return this._name;
    }

    /**
     * Gets the current value of the metric.
     */
    get slot(): TSlot {
        return this._slot;
    }

    /**
     * Cleans up the metric.
     * Emits a 'dispose' event that MonitoringManager can listen to.
     */
    dispose(): void {
        this._slot.dispose();
        this.emit('dispose', this);
    }
}