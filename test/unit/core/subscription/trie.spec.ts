import { TopicTrie, SetLeafCollection, SortedSetLeafCollection } from '@core/subscription/trie';

/**
 * Test suite for the TopicTrie class.
 * Tests the functionality of topic subscription matching, including exact matches,
 * plus wildcards, hash wildcards, and various edge cases.
 * Verifies that the trie correctly handles:
 * - Exact topic matches
 * - Plus wildcard (+) matches for single levels
 * - Hash wildcard (#) matches for multiple levels
 * - Topic pattern validation
 * - Subscription management
 */
describe('TopicTrie', () => {
    /** The TopicTrie instance used for testing */
    let trie: TopicTrie<string, SetLeafCollection<string>>;

    /**
     * Set up a fresh TopicTrie instance before each test.
     * Uses SetLeafCollection to ensure unique subscribers per topic.
     */
    beforeEach(() => {
        trie = new TopicTrie<string, SetLeafCollection<string>>(() => new SetLeafCollection());
    });

    /**
     * Test suite for exact topic matches.
     * Verifies that the trie correctly handles exact topic pattern matching
     * without any wildcards. Tests include:
     * - Single subscriber exact matches
     * - Multiple subscribers for the same topic
     * - Non-matching topics
     */
    describe('exact matches', () => {
        /**
         * Tests that exact topic patterns match only their specific topics.
         * Verifies that:
         * - A subscriber can receive messages for their exact topic
         * - The subscriber list contains exactly the expected subscriber
         */
        it('should match exact topics', () => {
            // Add a subscription for testing
            trie.set('device.status', 'subscriber1');

            // Verify exact match returns correct subscriber
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual(['subscriber1']);
        });

        /**
         * Tests that non-exact topic patterns do not match.
         * Verifies that:
         * - Similar but non-exact topics don't match
         * - No subscribers are returned for non-matching topics
         */
        it('should not match non-exact topics', () => {
            // Add a subscription for testing
            trie.set('device.status', 'subscriber1');

            // Verify non-matching topic returns empty array
            const matches = Array.from(trie.get('device.other'));
            expect(matches).toEqual([]);
        });

        /**
         * Tests handling of multiple subscribers for the same topic.
         * Verifies that:
         * - Multiple subscribers can subscribe to the same topic
         * - All subscribers are returned when querying the topic
         * - The order of subscribers is preserved
         */
        it('should handle multiple subscribers for the same topic', () => {
            // Add multiple subscriptions to the same topic
            trie.set('device.status', 'subscriber1');
            trie.set('device.status', 'subscriber2');

            // Verify all subscribers are returned
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toContain('subscriber1');
            expect(matches).toContain('subscriber2');
            expect(matches.length).toBe(2);
        });
    });

    /**
     * Test suite for plus wildcard matches.
     * Verifies that the trie correctly handles the '+' wildcard which matches
     * exactly one topic level. Tests include:
     * - Single level matching
     * - Multiple wildcard patterns
     * - Invalid wildcard usage
     */
    describe('plus wildcard matches', () => {
        /**
         * Tests that plus wildcards correctly match single levels.
         * Verifies that:
         * - '+' matches exactly one topic level
         * - The match works regardless of the level's value
         * - The subscriber receives messages for all matching topics
         */
        it('should match single level with plus wildcard', () => {
            // Add subscription with plus wildcard
            trie.set('device.+.status', 'subscriber1');

            // Verify wildcard matches any single level
            const matches = Array.from(trie.get('device.test.status'));
            expect(matches).toEqual(['subscriber1']);
        });

        /**
         * Tests that plus wildcards do not match multiple levels.
         * Verifies that:
         * - '+' strictly matches one level only
         * - Topics with more levels don't match
         * - Topics with fewer levels don't match
         */
        it('should not match multiple levels with plus wildcard', () => {
            // Add subscription with plus wildcard
            trie.set('device.+.status', 'subscriber1');

            // Verify plus wildcard doesn't match multiple levels
            const matches = Array.from(trie.get('device.test.more.status'));
            expect(matches).toEqual([]);
        });

        /**
         * Tests patterns with multiple plus wildcards.
         * Verifies that:
         * - Multiple '+' wildcards in a pattern work correctly
         * - Each '+' matches exactly one level
         * - The pattern matches only when all wildcards are satisfied
         */
        it('should match multiple plus wildcards', () => {
            // Add subscription with multiple plus wildcards
            trie.set('device.+.status.+', 'subscriber1');

            // Verify pattern matches with correct number of levels
            const matches = Array.from(trie.get('device.test.status.active'));
            expect(matches).toEqual(['subscriber1']);
        });
    });

    /**
     * Test suite for hash wildcard matches.
     * Verifies that the trie correctly handles the '#' wildcard which matches
     * zero or more topic levels at the end of a pattern.
     */
    describe('hash wildcard matches', () => {
        /**
         * Tests that hash wildcards match zero or more levels.
         * Verifies that '#' correctly matches any number of levels at the end of a topic.
         */
        it('should match zero or more levels with hash wildcard', () => {
            trie.set('device.#', 'subscriber1');

            // Test zero additional levels
            const matches1 = Array.from(trie.get('device'));
            // Test one additional level
            const matches2 = Array.from(trie.get('device.status'));
            // Test multiple additional levels
            const matches3 = Array.from(trie.get('device.status.active'));

            expect(matches1).toEqual(['subscriber1']);
            expect(matches2).toEqual(['subscriber1']);
            expect(matches3).toEqual(['subscriber1']);
        });

        /**
         * Tests that hash wildcards are only allowed at the end of a topic.
         * Verifies that attempting to use '#' in the middle of a topic throws an error.
         */
        it('should handle hash wildcard only at the end', () => {
            expect(() => trie.set('device.#.status', 'subscriber1')).toThrow();
        });

        /**
         * Tests that hash wildcards match at the current level and deeper levels.
         * This verifies the zero-or-more semantics of '#'.
         */
        it('should match at current level with hash wildcard', () => {
            trie.set('device.status.#', 'subscriber1');

            // Should match at exact level
            const exactMatch = Array.from(trie.get('device.status'));
            // Should match one level deeper
            const deeperMatch = Array.from(trie.get('device.status.active'));
            // Should match multiple levels deeper
            const deepestMatch = Array.from(trie.get('device.status.active.state'));

            expect(exactMatch).toEqual(['subscriber1']);
            expect(deeperMatch).toEqual(['subscriber1']);
            expect(deepestMatch).toEqual(['subscriber1']);
        });

        /**
         * Tests that hash wildcards match both current level leaves and hash wildcard leaves.
         * Verifies that when a node has both types of leaves, both are returned.
         */
        it('should match both current level and hash wildcard leaves', () => {
            // Add a regular subscription
            trie.set('device.status', 'exact');
            // Add a hash wildcard at the same level
            trie.set('device.#', 'hash');

            const matches = Array.from(trie.get('device.status'));
            expect(matches).toContain('exact');
            expect(matches).toContain('hash');
            expect(matches.length).toBe(2);
        });
    });

    /**
     * Tests for deleting subscriptions
     */
    describe('delete', () => {
        /**
         * Tests deletion of exact topic subscriptions.
         * Verifies that after deletion, the subscriber no longer receives messages,
         * and other subscribers to the same topic are not affected.
         * This enhanced test case aims to explicitly cover line 354 in trie.ts.
         */
        it('should delete exact matches', () => {
            // Add two subscribers to the same topic
            trie.set('device.status', 'subscriber1');
            trie.set('device.status', 'subscriber2');

            // Verify both subscribers are initially present
            let initialMatches = Array.from(trie.get('device.status'));
            expect(initialMatches).toContain('subscriber1');
            expect(initialMatches).toContain('subscriber2');
            expect(initialMatches.length).toBe(2);

            // Delete 'subscriber1'
            expect(trie.delete('device.status', 'subscriber1')).toBe(true); // Assert delete returns true

            // Verify 'subscriber1' is no longer present, but 'subscriber2' is still present
            const matchesAfterDelete = Array.from(trie.get('device.status'));
            expect(matchesAfterDelete).not.toContain('subscriber1');
            expect(matchesAfterDelete).toContain('subscriber2');
            expect(matchesAfterDelete.length).toBe(1);
        });

        /**
         * Tests deletion of wildcard (+) subscriptions.
         * Verifies that '+' wildcard subscriptions can be removed correctly,
         * and specifically targets line 354 in trie.ts during '+' wildcard deletion.
         */
        it('should delete plus wildcard matches', () => {
            // Set a subscription with a '+' wildcard
            trie.set('device.+.status', 'plusSubscriber');

            // Verify the subscription initially matches
            let initialMatches = Array.from(trie.get('device.test.status'));
            expect(initialMatches).toContain('plusSubscriber');
            expect(initialMatches.length).toBe(1);

            // Delete the '+' wildcard subscription
            expect(trie.delete('device.+.status', 'plusSubscriber')).toBe(true); // Assert delete returns true

            // Verify that after deletion, no matches are found for the '+' wildcard topic
            const matchesAfterDelete = Array.from(trie.get('device.test.status'));
            expect(matchesAfterDelete).toEqual([]); // Should be empty after deletion
        });

        /**
         * Tests deletion of non-existent subscriptions.
         * Verifies that attempting to delete a subscription that doesn't exist returns false.
         */
        it('should return false when deleting non-existent subscription', () => {
            expect(trie.delete('device.status', 'subscriber1')).toBe(false);
        });

        /**
         * Tests deletion of hash wildcard subscriptions.
         * Verifies that hash wildcard subscriptions can be removed correctly.
         */
        it('should handle hash wildcard deletion', () => {
            trie.set('device.#', 'subscriber1');
            expect(trie.delete('device.#', 'subscriber1')).toBe(true);
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual([]);
        });

        /**
         * Tests that nodes are properly cleaned up after deletion.
         * Verifies that empty nodes are removed from the trie.
         */
        it('should clean up empty nodes after deletion', () => {
            trie.set('device.status', 'subscriber1');
            trie.delete('device.status', 'subscriber1');
            // Try to set and get again to verify the path was cleaned
            trie.set('device.status', 'subscriber2');
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual(['subscriber2']);
        });

        /**
         * Tests that nodes with remaining subscriptions are not cleaned up.
         * Verifies that nodes with other subscribers are preserved.
         */
        it('should preserve nodes with remaining subscriptions', () => {
            trie.set('device.status', 'subscriber1');
            trie.set('device.status', 'subscriber2');
            trie.delete('device.status', 'subscriber1');
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual(['subscriber2']);
        });

        /**
         * Tests that parent nodes are recursively cleaned up after deletion.
         * Verifies that empty branches are removed from the trie.
         */
        it('should recursively clean up empty parent nodes', () => {
            // Create a deep path with a single subscriber
            trie.set('device.status.region.europe.active', 'subscriber1');

            // Delete the only subscriber
            expect(trie.delete('device.status.region.europe.active', 'subscriber1')).toBe(true);

            // Add a new subscription to verify the path was cleaned
            trie.set('device.status.region.europe.active', 'subscriber2');

            // Get matches to verify the new subscription works
            const matches = Array.from(trie.get('device.status.region.europe.active'));
            expect(matches).toEqual(['subscriber2']);

            // Verify that re-adding worked (implying the path was fully cleaned)
            const matches2 = Array.from(trie.get('device.status.region.europe'));
            expect(matches2).toEqual([]);  // Should be empty since parent nodes were cleaned
        });

        /**
         * Tests that recursive cleanup works with mixed wildcards.
         * Verifies that empty branches with wildcards are properly cleaned up.
         */
        it('should recursively clean up empty parent nodes with wildcards', () => {
            // Create a deep path with wildcards
            trie.set('device.+.region.+.active', 'subscriber1');

            // Delete the only subscriber
            expect(trie.delete('device.+.region.+.active', 'subscriber1')).toBe(true);

            // Add a new subscription to verify the path was cleaned
            trie.set('device.+.region.+.active', 'subscriber2');

            // Get matches to verify the new subscription works
            const matches = Array.from(trie.get('device.status.region.europe.active'));
            expect(matches).toEqual(['subscriber2']);

            // Verify that re-adding worked (implying the path was fully cleaned)
            const matches2 = Array.from(trie.get('device.status.region'));
            expect(matches2).toEqual([]);  // Should be empty since parent nodes were cleaned
        });

        /**
         * Tests deletion when a node has no plusWildcard.
         * This specifically targets line 316 in trie.ts.
         */
        it('should handle deletion with non-existent plus wildcard', () => {
            trie.set('device.status', 'subscriber1');
            expect(trie.delete('device.+', 'subscriber1')).toBe(false);
        });

        /**
         * Tests deletion when a node has no children.
         * This specifically targets line 327 in trie.ts.
         */
        it('should handle deletion with non-existent child', () => {
            trie.set('device.status', 'subscriber1');
            expect(trie.delete('device.other', 'subscriber1')).toBe(false);
        });

        /**
         * Tests deletion when a node is not empty.
         * This specifically targets line 332 in trie.ts.
         */
        it('should stop cleanup when encountering non-empty node', () => {
            // Set up a path with multiple subscribers
            trie.set('device.status.region.europe', 'subscriber1');
            trie.set('device.status', 'subscriber2'); // This will keep the 'status' node non-empty

            // Delete the deeper subscriber
            expect(trie.delete('device.status.region.europe', 'subscriber1')).toBe(true);

            // Verify the structure
            const matches1 = Array.from(trie.get('device.status'));
            expect(matches1).toEqual(['subscriber2']); // Should still have subscriber2

            // Verify the deeper path was cleaned but not the whole branch
            const matches2 = Array.from(trie.get('device.status.region.europe'));
            expect(matches2).toEqual([]); // Should be empty
        });

        /**
         * Tests that deleting a '#' wildcard subscription works correctly.
         * This specifically targets the branch at line 327 in trie.ts.
         */
        it('should handle deletion of hash wildcard', () => {
            trie.set('device.next', 'hashSubscriber');
            trie.set('device.#', 'hashSubscriber');
            expect(trie.delete('device.#', 'hashSubscriber')).toBe(true);
            const matches = Array.from(trie.get('device.test'));
            expect(matches).toEqual([]);
            // Attempt to delete the hash wildcard again
            expect(trie.delete('device.#', 'hashSubscriber')).toBe(false);
        });
    });

    /**
     * Tests for invalid topics
     */
    describe('invalid topics', () => {
        /**
         * Tests that invalid topic formats are rejected.
         * Verifies that the following invalid patterns throw errors:
         * - Empty topics
         * - Topics with consecutive dots
         * - Topics starting with a dot
         * - Topics ending with a dot
         */
        it('should throw error for invalid topic format', () => {
            expect(() => trie.set('device..status', 'subscriber1')).toThrow();
            expect(() => trie.set('', 'subscriber1')).toThrow();
            expect(() => trie.set('.device.status', 'subscriber1')).toThrow();
            expect(() => trie.set('device.status.', 'subscriber1')).toThrow();
        });

        /**
         * Tests that get() throws an error for invalid topic names that don't match TOPIC_REGEX.
         * This specifically targets line 223 in trie.ts.
         */
        it('should throw error for invalid topic name in get', () => {
            // Test invalid names that don't match TOPIC_REGEX
            expect(() => Array.from(trie.get('..invalid..'))).toThrow('Invalid topic name');  // Consecutive dots
            expect(() => Array.from(trie.get('.invalid'))).toThrow('Invalid topic name');     // Starts with dot
            expect(() => Array.from(trie.get('invalid.'))).toThrow('Invalid topic name');     // Ends with dot
            expect(() => Array.from(trie.get('in#valid.topic'))).toThrow('Invalid topic name'); // # in middle
            expect(() => Array.from(trie.get('too.many.levels.in.this.topic'))).toThrow('Invalid topic name'); // Too many levels
        });

        /**
         * Tests that delete() throws an error for invalid topic names that don't match TOPIC_REGEX.
         * This specifically targets line 316 in trie.ts.
         */
        it('should throw error for invalid topic name in delete', () => {
            // Test invalid names that don't match TOPIC_REGEX
            expect(() => trie.delete('..invalid..', 'subscriber1')).toThrow('Invalid topic name'); // Consecutive dots
            expect(() => trie.delete('.invalid', 'subscriber1')).toThrow('Invalid topic name');    // Starts with dot
            expect(() => trie.delete('invalid.', 'subscriber1')).toThrow('Invalid topic name');    // Ends with dot
            expect(() => trie.delete('in#valid.topic', 'subscriber1')).toThrow('Invalid topic name'); // # in middle
            expect(() => trie.delete('too.many.levels.in.this.topic', 'subscriber1')).toThrow('Invalid topic name'); // Too many levels
        });

        /**
         * Tests that getOrCreateCollection() throws an error for invalid topic names.
         * This specifically targets line 314 in trie.ts.
         */
        it('should throw error for invalid topic name in getOrCreateCollection', () => {
            expect(() => trie.getOrCreateCollection('..invalid..')).toThrow('Invalid topic name'); // Consecutive dots
            expect(() => trie.getOrCreateCollection('.invalid')).toThrow('Invalid topic name');    // Starts with dot
            expect(() => trie.getOrCreateCollection('invalid.')).toThrow('Invalid topic name');    // Ends with dot
            expect(() => trie.getOrCreateCollection('in#valid.topic')).toThrow('Invalid topic name'); // # in middle
            expect(() => trie.getOrCreateCollection('too.many.levels.in.this.topic')).toThrow('Invalid topic name'); // Too many levels
        });

        /**
         * Tests that getMatchingCollections() throws an error for invalid topic names.
         * This specifically targets line 364 in trie.ts.
         */
        it('should throw error for invalid topic name in getMatchingCollections', () => {
            expect(() => Array.from(trie.getMatchingCollections('..invalid..'))).toThrow('Invalid topic name'); // Consecutive dots
            expect(() => Array.from(trie.getMatchingCollections('.invalid'))).toThrow('Invalid topic name');    // Starts with dot
            expect(() => Array.from(trie.getMatchingCollections('invalid.'))).toThrow('Invalid topic name');    // Ends with dot
            expect(() => Array.from(trie.getMatchingCollections('in#valid.topic'))).toThrow('Invalid topic name'); // # in middle
            expect(() => Array.from(trie.getMatchingCollections('too.many.levels.in.this.topic'))).toThrow('Invalid topic name'); // Too many levels
        });
    });

    /**
     * Tests for clearing the trie
     */
    describe('clear', () => {
        /**
         * Tests that clearing the trie removes all subscriptions.
         * Verifies that after clearing:
         * - Exact matches are removed
         * - Plus wildcard matches are removed
         * - Hash wildcard matches are removed
         */
        it('should remove all subscriptions', () => {
            trie.set('device.status', 'subscriber1');
            trie.set('device.+.status', 'subscriber2');
            trie.set('sensor.#', 'subscriber3');

            trie.clear();

            expect(Array.from(trie.get('device.status'))).toEqual([]);
            expect(Array.from(trie.get('device.test.status'))).toEqual([]);
            expect(Array.from(trie.get('sensor.temperature'))).toEqual([]);
        });
    });

    /**
     * Tests for complex matching scenarios combining different types of patterns.
     * Verifies correct order of matches and handling of multiple applicable patterns.
     */
    describe('complex matches', () => {
        beforeEach(() => {
            trie.set('device.status', 'exact');
            trie.set('device.+.status', 'single');
            trie.set('device.#', 'multi');
        });

        /**
         * Tests that matches are returned in the correct order:
         * 1. Exact matches first
         * 2. Plus wildcard matches second
         * 3. Hash wildcard matches last
         */
        it('should return matches in correct order (exact, plus, hash)', () => {
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual(['exact', 'multi']);
        });

        /**
         * Tests that all applicable patterns match correctly.
         * Verifies that plus and hash wildcards work together.
         */
        it('should match all applicable patterns', () => {
            const matches = Array.from(trie.get('device.test.status'));
            expect(matches).toEqual(['single', 'multi']);
        });

        /**
         * Tests that overlapping patterns with different wildcards work correctly.
         * Verifies proper handling of multiple wildcard types at different levels.
         */
        it('should handle overlapping wildcard patterns', () => {
            trie.set('device.+.#', 'overlap');
            const matches = Array.from(trie.get('device.test.status.active'));
            expect(matches).toContain('multi');
            expect(matches).toContain('overlap');
            expect(matches.length).toBe(2);
        });

        /**
         * Tests that matches are returned correctly when a node has both hash wildcard
         * and regular leaves, but no duplicates.
         * This specifically targets line 223 in trie.ts.
         */
        it('should handle hash wildcard with no duplicate leaves', () => {
            trie.clear();  // Start with a clean slate
            trie.set('device.#', 'subscriber1');
            trie.set('device', 'subscriber1'); // Same subscriber for both patterns
            const matches = Array.from(trie.get('device'));
            expect(matches).toEqual(['subscriber1']); // Should only appear once
        });
    });

    /**
     * Test suite for entries() method.
     * Verifies that the trie correctly yields all topic-subscriber pairs
     * in the expected order. Tests include:
     * - Depth-first traversal order
     * - Multiple subscribers per topic
     * - Empty trie handling
     */
    describe('entries', () => {
        /**
         * Tests that entries are yielded in the correct order.
         * Verifies that:
         * - Entries are yielded in depth-first order
         * - The order follows: exact matches, child nodes, plus wildcards, hash wildcards
         * - All topic-subscriber pairs are included
         */
        it('should yield all topic-leaf pairs in depth-first order', () => {
            // Add various types of subscriptions
            trie.getOrCreateCollection('a.b.c').add('leaf1');
            trie.getOrCreateCollection('a.+.c').add('leaf2');
            trie.getOrCreateCollection('a.b.#').add('leaf3');
            trie.getOrCreateCollection('x.y').add('leaf4');

            // Convert entries to array and verify order
            const entries = Array.from(trie.entries());
            expect(entries).toEqual([
                ['a.b.c', 'leaf1'],
                ['a.b.#', 'leaf3'],
                ['a.+.c', 'leaf2'],
                ['x.y', 'leaf4']
            ]);
        });

        /**
         * Tests handling of multiple subscribers at the same topic.
         * Verifies that:
         * - All subscribers for a topic are yielded
         * - The order of subscribers is preserved
         * - Each topic-subscriber pair is unique
         */
        it('should handle multiple leaves at same topic', () => {
            // Add multiple subscribers to same topic
            trie.getOrCreateCollection('a.b').add('leaf1');
            trie.getOrCreateCollection('a.b').add('leaf2');

            // Verify all pairs are yielded correctly
            const entries = Array.from(trie.entries());
            expect(entries).toEqual([
                ['a.b', 'leaf1'],
                ['a.b', 'leaf2']
            ]);
        });

        /**
         * Tests behavior with an empty trie.
         * Verifies that:
         * - An empty trie yields no entries
         * - The generator completes successfully
         */
        it('should handle empty trie', () => {
            // Verify empty trie yields no entries
            const entries = Array.from(trie.entries());
            expect(entries).toEqual([]);
        });
    });

    describe('keys', () => {
        it('should yield all topic patterns in depth-first order', () => {
            const trie = new TopicTrie<string, SetLeafCollection<string>>(() => new SetLeafCollection());

            // Add various types of subscriptions
            trie.getOrCreateCollection('a.b.c').add('leaf1');
            trie.getOrCreateCollection('a.+.c').add('leaf2');
            trie.getOrCreateCollection('a.b.#').add('leaf3');
            trie.getOrCreateCollection('x.y').add('leaf4');

            // Convert keys to array for testing
            const keys = Array.from(trie.keys());

            // Check keys are yielded in correct order
            expect(keys).toEqual([
                'a.b.c',
                'a.b.#',
                'a.+.c',
                'x.y'
            ]);
        });

        it('should not yield topics with no subscribers', () => {
            const trie = new TopicTrie<string, SetLeafCollection<string>>(() => new SetLeafCollection());

            // Add and then remove a subscription
            const collection = trie.getOrCreateCollection('a.b.c');
            collection.add('leaf1');
            collection.delete('leaf1');

            const keys = Array.from(trie.keys());
            expect(keys).toEqual([]);
        });

        it('should handle empty trie', () => {
            const trie = new TopicTrie<string, SetLeafCollection<string>>(() => new SetLeafCollection());
            const keys = Array.from(trie.keys());
            expect(keys).toEqual([]);
        });
    });
});

/**
 * Test suite for the SetLeafCollection class.
 * Tests the functionality of the Set-based leaf collection implementation,
 * including adding, removing, and iterating over leaves.
 * Verifies that the collection maintains uniqueness of leaves.
 */
describe('SetLeafCollection', () => {
    /**
     * Tests the add operation and uniqueness constraint.
     * Verifies that:
     * - New leaves are added successfully
     * - Duplicate leaves are not added
     * - The size is updated correctly
     */
    it('should add leaves and maintain uniqueness', () => {
        const collection = new SetLeafCollection<string>();

        // Add first leaf and verify size
        collection.add('leaf1');
        expect(collection.size).toBe(1);

        // Try to add duplicate and verify size unchanged
        collection.add('leaf1');
        expect(collection.size).toBe(1);

        // Add different leaf and verify size increased
        collection.add('leaf2');
        expect(collection.size).toBe(2);
    });

    /**
     * Tests the delete operation.
     * Verifies that:
     * - Existing leaves can be removed
     * - Non-existent leaves return false
     * - The size is updated correctly
     */
    it('should remove leaves correctly', () => {
        const collection = new SetLeafCollection<string>();

        // Add and remove leaf
        collection.add('leaf1');
        expect(collection.delete('leaf1')).toBe(true);
        expect(collection.size).toBe(0);

        // Try to remove non-existent leaf
        expect(collection.delete('leaf2')).toBe(false);
    });

    /**
     * Tests the size property.
     * Verifies that:
     * - Initial size is 0
     * - Size increases with additions
     * - Size decreases with removals
     * - Size reflects the current number of unique leaves
     */
    it('should report correct size', () => {
        const collection = new SetLeafCollection<string>();

        // Verify initial empty size
        expect(collection.size).toBe(0);

        // Add leaves and verify size increases
        collection.add('leaf1');
        collection.add('leaf2');
        expect(collection.size).toBe(2);

        // Remove leaf and verify size decreases
        collection.delete('leaf1');
        expect(collection.size).toBe(1);
    });
});

/**
 * Test suite for SortedSetLeafCollection class.
 * Tests the implementation of a sorted collection of leaves with custom sorting and equality.
 * The collection maintains leaves in descending order based on a specified sort property,
 * while ensuring uniqueness based on a custom equality function.
 */
describe('SortedSetLeafCollection', () => {
    interface TestLeaf {
        id: string;
        priority: number;
    }

    let collection: SortedSetLeafCollection<TestLeaf, 'priority'>;

    beforeEach(() => {
        collection = new SortedSetLeafCollection<TestLeaf, 'priority'>(
            'priority',
            (a, b) => a.id === b.id
        );
    });

    /**
     * Tests for adding leaves to the collection.
     * Verifies the sorting behavior, uniqueness constraints, and priority-based ordering.
     */
    describe('add', () => {
        /**
         * Tests that leaves are added and maintained in descending order based on priority.
         * Verifies that the collection correctly sorts multiple leaves with different priorities.
         */
        it('should add leaves in sorted order', () => {
            const leaf1 = { id: '1', priority: 3 };
            const leaf2 = { id: '2', priority: 1 };
            const leaf3 = { id: '3', priority: 2 };

            collection.add(leaf1);
            collection.add(leaf2);
            collection.add(leaf3);

            const result = Array.from(collection);
            expect(result).toEqual([leaf1, leaf3, leaf2]); // Should be sorted by priority in descending order
        });

        /**
         * Tests that when a leaf with the same ID but different priority is added,
         * it replaces the existing leaf and maintains the correct sort order.
         */
        it('should update existing leaf with new priority', () => {
            const leaf1 = { id: '1', priority: 3 };
            const leaf1Updated = { id: '1', priority: 1 };

            collection.add(leaf1);
            collection.add(leaf1Updated);

            const result = Array.from(collection);
            expect(result).toEqual([leaf1Updated]); // Should contain the updated leaf with new priority
            expect(result.length).toBe(1); // Should not duplicate the leaf
        });

        /**
         * Tests that leaves with the same priority maintain their insertion order.
         * Verifies that when multiple leaves have equal priority, they are stored
         * in the order they were added rather than being re-sorted.
         */
        it('should maintain insertion order for same priority', () => {
            const leaf1 = { id: '1', priority: 1 };
            const leaf2 = { id: '2', priority: 1 };
            const leaf3 = { id: '3', priority: 1 };

            collection.add(leaf1);
            collection.add(leaf2);
            collection.add(leaf3);

            const result = Array.from(collection);
            expect(result).toEqual([leaf1, leaf2, leaf3]); // Should maintain insertion order
        });

        /**
         * Tests that when a leaf with the same ID and priority is added,
         * it replaces the existing leaf without changing the collection order.
         * This verifies the update behavior when only non-sort properties change.
         */
        it('should replace leaf with same id and priority', () => {
            const leaf1 = { id: '1', priority: 1, data: 'old' };
            const leaf1Updated = { id: '1', priority: 1, data: 'new' };

            collection.add(leaf1);
            collection.add(leaf1Updated);

            const result = Array.from(collection);
            expect(result).toEqual([leaf1Updated]); // Should contain the updated leaf
            expect(result.length).toBe(1); // Should not duplicate the leaf
        });
    });

    /**
     * Tests for deleting leaves from the collection.
     * Verifies proper removal of leaves and handling of non-existent leaves.
     */
    describe('delete', () => {
        /**
         * Tests that an existing leaf can be successfully deleted from the collection.
         * Verifies that the leaf is removed and the collection maintains its order.
         */
        it('should delete existing leaf', () => {
            const leaf1 = { id: '1', priority: 1 };
            const leaf2 = { id: '2', priority: 2 };

            collection.add(leaf1);
            collection.add(leaf2);

            expect(collection.delete(leaf1)).toBe(true);
            const result = Array.from(collection);
            expect(result).toEqual([leaf2]);
        });

        /**
         * Tests that attempting to delete a non-existent leaf returns false.
         * Verifies that the collection remains unchanged when deletion fails.
         */
        it('should return false when deleting non-existent leaf', () => {
            const leaf1 = { id: '1', priority: 1 };
            const leaf2 = { id: '2', priority: 2 };

            collection.add(leaf1);
            expect(collection.delete(leaf2)).toBe(false);
            expect(Array.from(collection)).toEqual([leaf1]);
        });
    });

    /**
     * Tests for custom equality function behavior.
     * Verifies that the collection correctly uses the provided equality function
     * to determine leaf uniqueness and handle updates.
     */
    describe('custom equality', () => {
        /**
         * Tests that the custom equality function is used to identify and update leaves.
         * Verifies that leaves with the same ID (according to the equality function)
         * are treated as the same leaf, regardless of other property differences.
         */
        it('should use custom equality function', () => {
            const collection = new SortedSetLeafCollection<TestLeaf, 'priority'>(
                'priority',
                (a: TestLeaf, b: TestLeaf) => a.id === b.id
            );

            const leaf1 = { id: '1', priority: 1 };
            const leaf1Updated = { id: '1', priority: 2 };
            const leaf2 = { id: '2', priority: 1 };

            collection.add(leaf1);
            collection.add(leaf1Updated); // Should update leaf1
            collection.add(leaf2);

            const result = Array.from(collection);
            expect(result).toEqual([leaf1Updated, leaf2]); // Should be sorted by priority in descending order
            expect(result.length).toBe(2); // Should not duplicate leaf1
        });
    });

    /**
     * Tests for the size property of the collection.
     * Verifies that the collection correctly tracks the number of leaves it contains
     * through various operations.
     */
    describe('size', () => {
        /**
         * Tests that the size property accurately reflects the number of leaves
         * in the collection as leaves are added and removed.
         * Verifies size updates through add and delete operations.
         */
        it('should return correct collection size', () => {
            expect(collection.size).toBe(0);

            const leaf1 = { id: '1', priority: 1 };
            const leaf2 = { id: '2', priority: 2 };

            collection.add(leaf1);
            expect(collection.size).toBe(1);

            collection.add(leaf2);
            expect(collection.size).toBe(2);

            collection.delete(leaf1);
            expect(collection.size).toBe(1);

            collection.delete(leaf2);
            expect(collection.size).toBe(0);
        });
    });
});
