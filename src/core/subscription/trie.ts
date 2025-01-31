/**
 * @file Defines a topic trie data structure for efficient subscription matching.
 */

/**
 * Interface for a collection that can store and iterate over leaves.
 * Leaf collections are used to store the subscribers at each node in the Trie.
 * Implementations can vary in terms of ordering and uniqueness of elements.
 *
 * @template T The type of the leaf (subscriber) stored in the collection.
 */
export interface LeafCollection<T> {
    /**
     * Adds a value (leaf) to the collection.
     *
     * @param value The leaf to add.
     */
    add(value: T): void;

    /**
     * Deletes a value (leaf) from the collection.
     *
     * @param value The leaf to delete.
     * @returns `true` if the leaf was found and deleted, `false` otherwise.
     */
    delete(value: T): boolean;

    /**
     * Returns an iterator over the leaves in the collection.
     * This allows the collection to be used in `for...of` loops.
     *
     * @returns An iterator for the leaf collection.
     */
    [Symbol.iterator](): Iterator<T>;

    /**
     * Returns the number of leaves in the collection.
     */
    size: number;
}

/**
 * Represents a node in the topic trie.
 * Each node can have children nodes for more specific topic levels,
 * wildcard nodes ('+' and '#'), and a collection of leaves (subscribers).
 *
 * @template T The type of the leaf (subscriber) stored in the trie.
 * @template C The type of the LeafCollection used to store leaves in this node.
 *           Defaults to `LeafCollection<T>`.
 * @private
 */
interface TrieNode<T, C extends LeafCollection<T>> {
    /**
     * Map of child nodes, keyed by the topic segment that leads to them.
     * These are for exact topic matches (e.g., 'events', 'europe').
     */
    children: Map<string, TrieNode<T, C>>;

    /**
     * Special child node for the '+' wildcard.
     * This node is used to match any single topic level.
     */
    plusWildcard?: TrieNode<T, C>;  // For '+' wildcard

    /**
     * Leaf collection for the '#' wildcard.
     * This collection stores leaves that subscribe to the '#' wildcard at this level,
     * which matches zero or more subsequent topic levels.
     */
    hashWildcard?: C;  // For '#' wildcard

    /**
     * Collection of leaves (subscribers) associated with the topic path leading to this node.
     * These are the subscribers that exactly match the topic up to this point.
     */
    leafs: C;
}

/**
 * Regular expression to validate topic names.
 *
 * Topics are limited to 5 levels deep and can contain alphanumeric characters and the '+' wildcard.
 * The '#' wildcard is only allowed as the last segment.
 *
 * @private
 */
const TOPIC_REGEX = /^([a-zA-Z][a-zA-Z0-9]*|\+)(\.([a-zA-Z][a-zA-Z0-9]*|\+)){0,3}(\.([a-zA-Z][a-zA-Z0-9]*|\+|#))?$/; // Limit to 5 levels deep

/**
 * Topic trie data structure for efficient matching of topics against subscriptions.
 * Supports MQTT-style wildcards:
 *  - `+`: Matches a single level.
 *  - `#`: Matches zero or more levels, and must be the last level.
 *
 *  The trie is parameterized by:
 *  - `T`: The type of the leaf (subscriber) stored in the trie.
 *  - `C`: The type of the `LeafCollection` used to store leaves. This allows for different
 *         collection implementations (e.g., `SetLeafCollection` for unique subscribers,
 *         `ArrayLeafCollection` for ordered or non-unique subscribers).
 *
 * @template T The type of the leaf (subscriber) stored in the trie.
 * @template C The type of LeafCollection used to store leaves in the trie nodes.
 *           Defaults to `LeafCollection<T>`.
 */
export class TopicTrie<T, C extends LeafCollection<T>> {
    /**
     * The root node of the trie.
     * @private
     */
    private root: TrieNode<T, C>;

    /**
     * Function to create a new empty LeafCollection.
     * This is passed in the constructor to allow for different collection types.
     * @private
     */
    private createLeafCollection: () => C;

    /**
     * Constructs a new TopicTrie.
     *
     * @param createLeafCollection A function that returns a new empty `LeafCollection` instance.
     *                             This allows the trie to use different types of leaf collections (e.g., Set, Array).
     */
    constructor(createLeafCollection: () => C) {
        this.createLeafCollection = createLeafCollection;
        this.root = this.emptyNode();
    }

    /**
     * Creates an empty trie node.
     * This is a helper method to instantiate new nodes with the correct leaf collection.
     *
     * @private
     * @returns A new empty TrieNode.
     */
    private emptyNode(): TrieNode<T, C> {
        return {
            children: new Map(),
            leafs: this.createLeafCollection()
        };
    }

    /**
     * Adds a leaf (subscriber) to the trie for a given topic pattern.
     *
     * Supports two wildcard characters in the topic pattern:
     * - `+`: Matches a single level.
     * - `#`: Matches zero or more levels, must be at the end of the pattern.
     *
     * Examples:
     * - `set('baggage.events.europe', subscriber1)`
     * - `set('baggage.events.+', subscriber2)`  // Matches 'baggage.events.europe', 'baggage.events.america', etc.
     * - `set('baggage.#', subscriber3)`         // Matches 'baggage', 'baggage.events', 'baggage.events.europe', etc.
     *
     * @param topic The topic pattern to subscribe to. Must be a valid topic string.
     * @param leaf The leaf (subscriber) to associate with the topic pattern.
     * @throws {Error} If the topic is invalid according to `TOPIC_REGEX`.
     */
    public set(topic: string, leaf: T): void {
        if (!TOPIC_REGEX.test(topic)) throw new Error('Invalid topic name');
        const collection = this.getOrCreateCollection(topic);
        collection.add(leaf);
    }

    /**
     * Returns a generator that yields all leaves (subscribers) that match the given topic.
     *
     * The matching process follows MQTT wildcard rules:
     * - Exact topic segments are matched directly.
     * - `+` wildcard in the subscription matches any single topic segment in the topic.
     * - `#` wildcard in the subscription matches zero or more topic segments at the end of the topic.
     *
     * The order of yielded results is optimized for performance and predictability:
     * 1. Exact matches (subscriptions without wildcards) are yielded first.
     * 2. Matches with '+' wildcards are yielded next.
     * 3. Matches with '#' wildcards are yielded last.
     *
     * Examples:
     * - `get('baggage.events.europe')` will match subscriptions like:
     *   - 'baggage.events.europe' (exact match)
     *   - 'baggage.events.+'     ('+ wildcard match)
     *   - 'baggage.+'             ('+ wildcard, no match)
     *   - 'baggage.#'             ('# wildcard match)
     *   - '#'                     ('# wildcard match)
     *
     * @param topic The topic to match against subscriptions in the trie. Must be a valid topic string.
     * @returns A generator that yields all matching leaves (subscribers).
     * @throws {Error} If the topic is invalid according to `TOPIC_REGEX`.
     */
    public *get(topic: string): Generator<T> {
        if (!TOPIC_REGEX.test(topic)) throw new Error('Invalid topic name');
        const returned = new Set<T>(); // Keep track of returned leaves to avoid duplicates

        // Iterate through all matching collections and yield their leaves
        for (const collection of this.getMatchingCollections(topic)) {
            for (const leaf of collection) {
                if (!returned.has(leaf)) {
                    returned.add(leaf);
                    yield leaf;
                }
            }
        }
    }

    /**
     * Deletes a leaf (subscriber) from the trie for a given topic pattern.
     *
     * Important: The topic must exactly match the topic pattern used when adding the leaf with `set()`.
     * Wildcards are not expanded during deletion. For example, if you used `set('baggage.+', leaf)`,
     * you must use `delete('baggage.+', leaf)` to remove it.
     *
     * @param topic The exact topic pattern that was used when adding the leaf.
     * @param leaf The leaf (subscriber) to delete.
     * @returns `true` if the leaf was found and deleted, `false` otherwise.
     * @throws {Error} If the topic is invalid according to `TOPIC_REGEX`.
     */
    public delete(topic: string, leaf: T): boolean {
        if (!TOPIC_REGEX.test(topic)) throw new Error('Invalid topic name');
        const parts = topic.split('.');

        // Track the path we take through the trie for cleanup
        const path: { node: TrieNode<T, C>; part: string }[] = [];
        let node = this.root;

        // Follow the exact path in the trie based on the topic parts
        for (const part of parts) {
            // Handle hash wildcard (#)
            if (part === '#') {
                if (!node.hashWildcard) return false;
                node.hashWildcard.delete(leaf);
                if (node.hashWildcard.size === 0) delete node.hashWildcard;
                return true;
            }

            // Handle plus wildcard (+)
            if (part === '+') {
                if (!node.plusWildcard) return false;
                path.push({ node, part });
                node = node.plusWildcard;
                continue;
            }

            // Handle exact match
            const child = node.children.get(part);
            if (!child) return false;
            path.push({ node, part });
            node = child;
        }

        // Delete the leaf from the final node
        const deleted = node.leafs.delete(leaf);

        // If deletion was successful, clean up empty nodes
        if (deleted) {
            // Start from the leaf node's parent and work up
            for (let i = path.length - 1; i >= 0; i--) {
                const { node: parent, part } = path[i];
                const child = part === '+' ? parent.plusWildcard : parent.children.get(part);

                // If child node is empty, remove it
                if (child && this.isNodeEmpty(child)) {
                    if (part === '+') {
                        delete parent.plusWildcard;
                    } else {
                        parent.children.delete(part);
                    }
                } else {
                    // If we find a non-empty node, stop cleanup
                    break;
                }
            }
        }

        return deleted;
    }

    /**
     * Checks if a trie node is empty.
     * A node is considered empty if it has no children, no wildcard nodes, and no leaves in its collection.
     *
     * @private
     * @param node The node to check for emptiness.
     * @returns `true` if the node is empty, `false` otherwise.
     */
    private isNodeEmpty(node: TrieNode<T, C>): boolean {
        return node.children.size === 0 && // No child nodes for exact matches
               !node.plusWildcard &&       // No '+' wildcard node
               !node.hashWildcard &&       // No '#' wildcard collection
               node.leafs.size === 0;      // No leaves in the collection
    }

    /**
     * Clears the entire trie, removing all nodes and leaves.
     * Resets the trie to its initial empty state.
     */
    public clear(): void {
        this.root = this.emptyNode(); // Simply replace the root with a new empty node, garbage collector will handle the rest
    }

    /**
     * Gets or creates a leaf collection for a given topic pattern.
     * This provides direct access to the collection for manual manipulation.
     *
     * Supports two wildcard characters in the topic pattern:
     * - `+`: Matches a single level.
     * - `#`: Matches zero or more levels, must be at the end of the pattern.
     *
     * @param topic The topic pattern to get or create a collection for. Must be a valid topic string.
     * @returns The leaf collection associated with the topic pattern.
     * @throws {Error} If the topic is invalid according to `TOPIC_REGEX`.
     */
    public getOrCreateCollection(topic: string): C {
        if (!TOPIC_REGEX.test(topic)) throw new Error('Invalid topic name');
        let node = this.root;
        const parts = topic.split('.');

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            // Handle hash wildcard (#) - must be at the end
            if (part === '#') {
                if (!node.hashWildcard) node.hashWildcard = this.createLeafCollection();
                return node.hashWildcard;
            }

            // Handle plus wildcard (+)
            if (part === '+') {
                if (!node.plusWildcard) node.plusWildcard = this.emptyNode();
                node = node.plusWildcard;
            } else {
                // Get or create the child node for this part (exact match)
                let child = node.children.get(part);
                if (!child) {
                    child = this.emptyNode();
                    node.children.set(part, child);
                }
                node = child;
            }
        }

        return node.leafs;
    }

    /**
     * Returns a generator that yields all leaf collections that match the given topic.
     * This provides direct access to the collections for manual manipulation.
     *
     * The matching process follows MQTT wildcard rules:
     * - Exact topic segments are matched directly.
     * - `+` wildcard in the subscription matches any single topic segment in the topic.
     * - `#` wildcard in the subscription matches zero or more topic segments at the end of the topic.
     *
     * The order of yielded collections matches the order of the existing `get()` method:
     * 1. Exact matches (subscriptions without wildcards) are yielded first.
     * 2. Matches with '+' wildcards are yielded next.
     * 3. Matches with '#' wildcards are yielded last.
     *
     * @param topic The topic to match against subscriptions in the trie. Must be a valid topic string.
     * @returns A generator that yields all matching leaf collections.
     * @throws {Error} If the topic is invalid according to `TOPIC_REGEX`.
     */
    public *getMatchingCollections(topic: string): Generator<C> {
        if (!TOPIC_REGEX.test(topic)) throw new Error('Invalid topic name');
        const returned = new Set<C>(); // Keep track of returned collections to avoid duplicates

        // Start recursive traversal from the root node
        yield* this.getMatchingCollectionsRecursive(this.root, topic.split('.'), 0, returned);
    }

    /**
     * Recursively traverses the trie to find and yield collections that match a topic path.
     * This is similar to getMatches but operates on collections instead of leaves.
     *
     * @private
     * @param node The current trie node being examined.
     * @param parts The array of topic segments to match against.
     * @param depth The current depth in the topic path (index of the current segment in `parts`).
     * @param returned A Set to keep track of collections already yielded to prevent duplicates.
     * @returns A generator that yields matching collections from this node and its descendants.
     */
    private *getMatchingCollectionsRecursive(
        node: TrieNode<T, C>,
        parts: string[],
        depth: number,
        returned: Set<C>
    ): Generator<C> {
        // Base case: If we have reached the target depth (all topic parts processed)
        if (depth === parts.length) {
            if (!returned.has(node.leafs)) {
                returned.add(node.leafs);
                yield node.leafs;
            }
            if (node.hashWildcard && !returned.has(node.hashWildcard)) {
                returned.add(node.hashWildcard);
                yield node.hashWildcard;
            }
            return;
        }

        const part = parts[depth];
        const nextNode = node.children.get(part);

        // 1. Try exact match
        if (nextNode) {
            yield* this.getMatchingCollectionsRecursive(nextNode, parts, depth + 1, returned);
        }

        // 2. Try '+' wildcard match
        if (node.plusWildcard) {
            yield* this.getMatchingCollectionsRecursive(node.plusWildcard, parts, depth + 1, returned);
        }

        // 3. Check for '#' wildcard matches
        if (node.hashWildcard && !returned.has(node.hashWildcard)) {
            returned.add(node.hashWildcard);
            yield node.hashWildcard;
        }
    }
}

/**
 * Implementation of `LeafCollection` using a `Set`.
 * This collection stores unique leaves in no particular order.
 * Useful when you need to ensure that each subscriber is only added once per topic.
 *
 * @template T The type of the leaf (subscriber) stored in the set.
 */
export class SetLeafCollection<T> implements LeafCollection<T> {
    /**
     * The underlying Set to store leaves.
     * @private
     */
    private set: Set<T>;

    /**
     * Constructs a new empty SetLeafCollection.
     */
    constructor() {
        this.set = new Set<T>();
    }

    /** @inheritdoc */
    add(value: T): void {
        this.set.add(value);
    }

    /** @inheritdoc */
    delete(value: T): boolean {
        return this.set.delete(value);
    }

    /** @inheritdoc */
    [Symbol.iterator](): Iterator<T> {
        return this.set[Symbol.iterator]();
    }

    /** @inheritdoc */
    get size(): number {
        return this.set.size;
    }
}

/**
 * Implementation of `LeafCollection` using a sorted array with set-like uniqueness.
 * This collection stores unique leaves in sorted order based on a specified property.
 * Useful when you need to maintain both uniqueness and a specific sort order.
 *
 * @template T The type of the leaf stored in the collection
 * @template K The key of T to use for sorting (must be a number)
 */
export class SortedSetLeafCollection<T, K extends keyof T> implements LeafCollection<T> {
    /**
     * The underlying Array to store leaves in sorted order.
     * @private
     */
    private array: T[];

    /**
     * The key to use for sorting leaves.
     * @private
     */
    private readonly sortKey: K;

    /**
     * Function to determine if two leaves are equal.
     * @private
     */
    private readonly isEqual: (a: T, b: T) => boolean;

    /**
     * Constructs a new empty SortedSetLeafCollection.
     *
     * @param sortKey The key of T to use for sorting
     * @param isEqual Function to determine leaf equality.
     */
    constructor(sortKey: K, isEqual: (a: T, b: T) => boolean) {
        this.array = [];
        this.sortKey = sortKey;
        this.isEqual = isEqual;
    }

    /** @inheritdoc */
    add(value: T): void {
        let i = 0;
        let index = -1; // Initialize index to -1, which means position to insert not found

        // Find the insertion point while checking for duplicates
        while (i < this.array.length) {
            const existing = this.array[i];
            // If we find the same leaf, update its value if different
            if (this.isEqual(existing, value)) {
                if (existing[this.sortKey] === value[this.sortKey]) {
                    this.array[i] = value;
                    return; // Already exists with same sort value, nothing else to do
                } else {
                    // Remove existing entry and continue to find new insertion point
                    this.array.splice(i, 1);
                    continue;
                }
            }
            // Find first position where sort value is less than new value's sort value
            if (index < 0 && existing[this.sortKey] < value[this.sortKey]) {
                index = i;
            }
            i++;
        }

        // Insert at found position or push to end if no position found
        if (index < 0) {
            this.array.push(value);
        } else {
            this.array.splice(index, 0, value);
        }
    }

    /** @inheritdoc */
    delete(value: T): boolean {
        const index = this.array.findIndex(item => this.isEqual(item, value));
        if (index >= 0) {
            this.array.splice(index, 1);
            return true;
        }
        return false;
    }

    /** @inheritdoc */
    [Symbol.iterator](): Iterator<T> {
        return this.array[Symbol.iterator]();
    }

    /** @inheritdoc */
    get size(): number {
        return this.array.length;
    }
}