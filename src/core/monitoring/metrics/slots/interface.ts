export interface IBaseSlot {}

/**
 * Read-only interface for accessing metric values.
 * All metrics output numbers, regardless of their input type.
 */
export interface IReadOnlySlot extends IBaseSlot {
    /**
     * Gets the current value.
     */
    get value(): number;

    /**
     * Gets the last modified time.
     */
    get lastModified(): Date;
}

/**
 * Interface for managing slot lifecycle.
 * Extends read-only access with management operations.
 */
export interface IManageableSlot extends IReadOnlySlot {
    /**
     * Resets the value to its initial state.
     */
    reset(): void;

    /**
     * Cleanup any resources used by this slot.
     */
    dispose(): void;
}

/**
 * Base interface for all slot implementations.
 * TInput is the type of value that can be set.
 * All slots output numbers, but can accept different input types.
 */
export interface ISlotSettable<TInput = number> {
    /**
     * Sets the current value.
     */
    set(value: TInput): void;
}

export interface ISlotAddable<TInput = number> {
    /**
     * Adds to the current value.
     */
    add(value: TInput): void;
}
