import { TopicTrie, SetLeafCollection, ArrayLeafCollection } from '@core/subscription/trie';

/**
 * Test suite for TopicTrie class.
 * Tests the implementation of a topic-based publish/subscribe system with wildcard support.
 */
describe('TopicTrie', () => {
    let trie: TopicTrie<string, SetLeafCollection<string>>;

    beforeEach(() => {
        trie = new TopicTrie<string, SetLeafCollection<string>>(() => new SetLeafCollection());
    });

    /**
     * Tests for exact topic matches without wildcards.
     * Verifies basic subscription and retrieval functionality.
     */
    describe('exact matches', () => {
        /**
         * Tests that exact topic matches work correctly.
         * Verifies that a subscriber can receive messages for the exact topic they subscribed to.
         */
        it('should match exact topics', () => {
            trie.set('device.status', 'subscriber1');
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toEqual(['subscriber1']);
        });

        /**
         * Tests that non-matching topics don't return any subscribers.
         * Verifies that subscribers only receive messages for their exact topic.
         */
        it('should not match non-exact topics', () => {
            trie.set('device.status', 'subscriber1');
            const matches = Array.from(trie.get('device.other'));
            expect(matches).toEqual([]);
        });

        /**
         * Tests that multiple subscribers can subscribe to the same topic.
         * Verifies that all subscribers receive messages for their topic.
         */
        it('should handle multiple subscribers for the same topic', () => {
            trie.set('device.status', 'subscriber1');
            trie.set('device.status', 'subscriber2');
            const matches = Array.from(trie.get('device.status'));
            expect(matches).toContain('subscriber1');
            expect(matches).toContain('subscriber2');
            expect(matches.length).toBe(2);
        });
    });

    /**
     * Tests for single-level wildcard matches using '+'.
     * Verifies that '+' correctly matches exactly one topic level.
     */
    describe('plus wildcard matches', () => {
        /**
         * Tests that plus wildcard matches exactly one level.
         * Verifies that 'device.+.status' matches 'device.test.status'.
         */
        it('should match single level with plus wildcard', () => {
            trie.set('device.+.status', 'subscriber1');
            const matches = Array.from(trie.get('device.test.status'));
            expect(matches).toEqual(['subscriber1']);
        });

        /**
         * Tests that plus wildcard doesn't match multiple levels.
         * Verifies that 'device.+.status' doesn't match 'device.test.more.status'.
         */
        it('should not match multiple levels with plus wildcard', () => {
            trie.set('device.+.status', 'subscriber1');
            const matches = Array.from(trie.get('device.test.more.status'));
            expect(matches).toEqual([]);
        });

        /**
         * Tests that multiple plus wildcards in a pattern work correctly.
         * Verifies that 'device.+.status.+' matches 'device.test.status.active'.
         */
        it('should match multiple plus wildcards', () => {
            trie.set('device.+.status.+', 'subscriber1');
            const matches = Array.from(trie.get('device.test.status.active'));
            expect(matches).toEqual(['subscriber1']);
        });
    });

    /**
     * Tests for multi-level wildcard matches using '#'.
     * Verifies that '#' correctly matches zero or more topic levels.
     */
    describe('hash wildcard matches', () => {
        /**
         * Tests that hash wildcards match zero or more levels correctly.
         * This includes:
         * - Matching at the exact level (zero additional levels)
         * - Matching one level deeper
         * - Matching multiple levels deeper
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
     * Tests for ArrayLeafCollection implementation
     */
    describe('ArrayLeafCollection', () => {
        let arrayTrie: TopicTrie<string, ArrayLeafCollection<string>>;

        beforeEach(() => {
            arrayTrie = new TopicTrie<string, ArrayLeafCollection<string>>(() => new ArrayLeafCollection());
        });

        /**
         * Tests basic operations with ArrayLeafCollection.
         * Verifies that subscribers are stored and retrieved in order.
         */
        it('should maintain insertion order', () => {
            arrayTrie.set('device.status', 'subscriber2');
            arrayTrie.set('device.status', 'subscriber1');
            const matches = Array.from(arrayTrie.get('device.status'));
            expect(matches).toEqual(['subscriber2', 'subscriber1']);
        });

        /**
         * Tests duplicate prevention in ArrayLeafCollection.
         * Verifies that adding the same subscriber twice only stores it once.
         */
        it('should prevent duplicates', () => {
            arrayTrie.set('device.status', 'subscriber1');
            arrayTrie.set('device.status', 'subscriber1');
            const matches = Array.from(arrayTrie.get('device.status'));
            expect(matches).toEqual(['subscriber1']);
        });

        /**
         * Tests deletion from ArrayLeafCollection.
         * Verifies that subscribers can be removed while maintaining order.
         */
        it('should handle deletion correctly', () => {
            arrayTrie.set('device.status', 'subscriber1');
            arrayTrie.set('device.status', 'subscriber2');
            arrayTrie.set('device.status', 'subscriber3');
            arrayTrie.delete('device.status', 'subscriber2');
            const matches = Array.from(arrayTrie.get('device.status'));
            expect(matches).toEqual(['subscriber1', 'subscriber3']);
        });

        it('should return false when deleting non-existent value', () => {
            const collection = new ArrayLeafCollection<string>();
            collection.add('a');
            const deleted = collection.delete('non-existent');
            expect(deleted).toBe(false);
            expect(collection.size).toBe(1); // Size should not change
            const values = [...collection];
            expect(values).toEqual(['a']); // Content should not change
        });
    });
});
