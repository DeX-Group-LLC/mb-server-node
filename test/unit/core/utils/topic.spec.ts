import { TopicUtils } from '@core/utils';

// Mock external dependencies
jest.mock('@utils/logger');

/**
 * Test suite for TopicUtils class.
 * Tests the core functionality of topic name validation and manipulation.
 *
 * Key areas tested:
 * - Topic name validation
 * - Topic name canonicalization
 * - Topic hierarchy navigation
 * - Topic pattern matching
 */
describe('TopicUtils', () => {
    /**
     * Tests for topic name validation functionality.
     * Verifies the isValid method properly validates:
     * - Basic topic formats
     * - Multi-level topics
     * - Case sensitivity
     * - Invalid formats and characters
     */
    describe('isValid', () => {
        /**
         * Verifies that valid topic name formats are accepted.
         * The method should accept:
         * - Basic two-level topics
         * - Multi-level topics
         * - Mixed case topics
         */
        it('should return true for valid topic names', () => {
            // Test basic two-level topics
            expect(TopicUtils.isValid('baggage.events')).toBe(true);
            expect(TopicUtils.isValid('flight.updates')).toBe(true);

            // Test multi-level topics
            expect(TopicUtils.isValid('baggage.events.europe')).toBe(true);
            expect(TopicUtils.isValid('a.b.c.d')).toBe(true);

            // Test mixed case (case-insensitive validation)
            expect(TopicUtils.isValid('Valid.Topic')).toBe(true);
        });

        /**
         * Verifies that invalid topic name formats are rejected.
         * The method should reject:
         * - Empty and whitespace topics
         * - Topics with invalid characters
         * - Topics with invalid dot patterns
         * - Topics exceeding length limits
         */
        it('should return false for invalid topic names', () => {
            // Test empty and whitespace topics
            expect(TopicUtils.isValid('')).toBe(false);
            expect(TopicUtils.isValid(' ')).toBe(false);

            // Test topics with invalid slash characters
            expect(TopicUtils.isValid('/')).toBe(false);
            expect(TopicUtils.isValid('//')).toBe(false);
            expect(TopicUtils.isValid('baggage//events')).toBe(false);
            expect(TopicUtils.isValid('/baggage')).toBe(false);
            expect(TopicUtils.isValid('baggage/')).toBe(false);
            expect(TopicUtils.isValid('baggage/events/')).toBe(false);
            expect(TopicUtils.isValid('baggage//events/europe')).toBe(false);

            // Test topics with invalid dot patterns
            expect(TopicUtils.isValid('.')).toBe(false);
            expect(TopicUtils.isValid('a.')).toBe(false);
            expect(TopicUtils.isValid('.a')).toBe(false);
            expect(TopicUtils.isValid('a..')).toBe(false);
            expect(TopicUtils.isValid('..a')).toBe(false);

            // Test topics with invalid hyphen characters
            expect(TopicUtils.isValid('valid-topic')).toBe(false);

            // Test topic length constraint (max 255 characters)
            const longTopic = 'a'.repeat(256);
            expect(TopicUtils.isValid(longTopic)).toBe(false);
        });
    });

    /**
     * Tests for topic name canonicalization functionality.
     * Verifies the getCanonical method properly:
     * - Converts topic names to lowercase
     * - Handles mixed case inputs
     * - Maintains topic structure
     */
    describe('getCanonical', () => {
        /**
         * Verifies that topic names are properly converted to lowercase.
         * The method should:
         * - Convert uppercase to lowercase
         * - Handle mixed case inputs
         * - Preserve dots and structure
         */
        it('should return lowercase version of topic name', () => {
            // Test conversion of various case combinations
            expect(TopicUtils.getCanonical('baggage.EVENTS')).toBe('baggage.events');
            expect(TopicUtils.getCanonical('Flight.Updates')).toBe('flight.updates');
            expect(TopicUtils.getCanonical('A.b.C.d')).toBe('a.b.c.d');
        });
    });

    /**
     * Tests for topic parent resolution functionality.
     * Verifies the getParent method properly:
     * - Extracts parent topics
     * - Handles top-level topics
     * - Validates input topics
     */
    describe('getParent', () => {
        /**
         * Verifies that parent topics are correctly extracted.
         * The method should:
         * - Return immediate parent of multi-level topics
         * - Convert result to lowercase
         * - Handle various depth levels
         */
        it('should return the parent topic for valid child topics', () => {
            // Test parent extraction from multi-level topics
            expect(TopicUtils.getParent('baggage.events.europe')).toBe('baggage.events');
            expect(TopicUtils.getParent('a.b.c.d')).toBe('a.b.c');

            // Test case-insensitive parent resolution
            expect(TopicUtils.getParent('Baggage.Events.Europe')).toBe('baggage.events');
            expect(TopicUtils.getParent('A.b.C.d')).toBe('a.b.c');
        });

        /**
         * Verifies that top-level topics return null as parent.
         * The method should:
         * - Return null for single-level topics
         * - Handle case variations
         */
        it('should return null for top-level topics', () => {
            // Test single-level topics (no parent)
            expect(TopicUtils.getParent('baggage')).toBe(null);
            expect(TopicUtils.getParent('a')).toBe(null);

            // Test case-insensitive single-level topics
            expect(TopicUtils.getParent('Baggage')).toBe(null);
            expect(TopicUtils.getParent('A')).toBe(null);
        });

        /**
         * Verifies that invalid topic names return null.
         * The method should:
         * - Return null for empty strings
         * - Return null for invalid formats
         */
        it('should return null for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.getParent('')).toBe(null);
            expect(TopicUtils.getParent(' ')).toBe(null);
            expect(TopicUtils.getParent('/')).toBe(null);
        });
    });

    /**
     * Tests for direct child relationship checking functionality.
     * Verifies the isDirectChild method properly:
     * - Identifies direct parent-child relationships
     * - Rejects indirect relationships
     * - Handles case sensitivity
     * - Validates input topics
     */
    describe('isDirectChild', () => {
        /**
         * Verifies that direct parent-child relationships are identified correctly.
         * The method should:
         * - Identify immediate parent-child pairs
         * - Handle case-insensitive comparisons
         */
        it('should return true if a topic is a direct child of another topic', () => {
            // Test direct parent-child relationships
            expect(TopicUtils.isDirectChild('baggage.events.europe', 'baggage.events')).toBe(true);
            expect(TopicUtils.isDirectChild('a.b.c', 'a.b')).toBe(true);

            // Test case-insensitive relationships
            expect(TopicUtils.isDirectChild('Baggage.Events.Europe', 'Baggage.Events')).toBe(true);
            expect(TopicUtils.isDirectChild('A.b.c', 'A.b')).toBe(true);
        });

        /**
         * Verifies that non-direct relationships are rejected.
         * The method should:
         * - Reject grandparent relationships
         * - Reject unrelated topics
         * - Handle case-insensitive comparisons
         */
        it('should return false if a topic is not a direct child of another topic', () => {
            // Test non-direct relationships (grandparent)
            expect(TopicUtils.isDirectChild('baggage.events.europe', 'baggage')).toBe(false);
            expect(TopicUtils.isDirectChild('a.b.c', 'a')).toBe(false);

            // Test unrelated topics
            expect(TopicUtils.isDirectChild('a.b.c', 'a.c')).toBe(false);

            // Test case-insensitive non-direct relationships
            expect(TopicUtils.isDirectChild('Baggage.Events.Europe', 'Baggage')).toBe(false);
            expect(TopicUtils.isDirectChild('A.b.c', 'A')).toBe(false);
            expect(TopicUtils.isDirectChild('A.b.c', 'A.c')).toBe(false);
        });

        /**
         * Verifies that invalid topic names are handled properly.
         * The method should:
         * - Return false for empty topics
         * - Return false for invalid topic formats
         */
        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.isDirectChild('', 'baggage')).toBe(false);
            expect(TopicUtils.isDirectChild('baggage.events', '')).toBe(false);
            expect(TopicUtils.isDirectChild('/', 'baggage')).toBe(false);
        });
    });

    /**
     * Tests for descendant relationship checking functionality.
     * Verifies the isDescendant method properly:
     * - Identifies direct and indirect descendant relationships
     * - Rejects non-descendant relationships
     * - Handles case sensitivity
     * - Validates input topics
     */
    describe('isDescendant', () => {
        /**
         * Verifies that descendant relationships are identified correctly.
         * The method should:
         * - Identify direct parent-child relationships
         * - Identify indirect ancestor relationships
         * - Handle case-insensitive comparisons
         */
        it('should return true if a topic is a descendant of another topic', () => {
            // Test direct parent-child relationships
            expect(TopicUtils.isDescendant('baggage.events.europe', 'baggage.events')).toBe(true);
            expect(TopicUtils.isDescendant('a.b.c', 'a.b')).toBe(true);

            // Test indirect relationships (grandparent)
            expect(TopicUtils.isDescendant('baggage.events.europe', 'baggage')).toBe(true);
            expect(TopicUtils.isDescendant('a.b.c', 'a')).toBe(true);

            // Test case-insensitive relationships
            expect(TopicUtils.isDescendant('Baggage.Events.Europe', 'Baggage.Events')).toBe(true);
            expect(TopicUtils.isDescendant('Baggage.Events.Europe', 'Baggage')).toBe(true);
            expect(TopicUtils.isDescendant('A.b.c', 'A.b')).toBe(true);
            expect(TopicUtils.isDescendant('A.b.c', 'A')).toBe(true);
        });

        /**
         * Verifies that non-descendant relationships are rejected.
         * The method should:
         * - Reject unrelated topics
         * - Reject reverse relationships
         * - Reject self-relationships
         * - Handle case-insensitive comparisons
         */
        it('should return false if a topic is not a descendant of another topic', () => {
            // Test unrelated topics
            expect(TopicUtils.isDescendant('a.b.c', 'a.c')).toBe(false);
            expect(TopicUtils.isDescendant('A.b.c', 'A.c')).toBe(false);

            // Test reverse relationships (parent is not descendant of child)
            expect(TopicUtils.isDescendant('baggage.events', 'baggage.events.europe')).toBe(false);
            expect(TopicUtils.isDescendant('a.b', 'a.b.c')).toBe(false);
            expect(TopicUtils.isDescendant('Baggage.Events', 'Baggage.Events.Europe')).toBe(false);
            expect(TopicUtils.isDescendant('A.b', 'A.b.c')).toBe(false);

            // Test self-relationships (topic is not its own descendant)
            expect(TopicUtils.isDescendant('baggage.events', 'baggage.events')).toBe(false);
            expect(TopicUtils.isDescendant('a.b', 'a.b')).toBe(false);
            expect(TopicUtils.isDescendant('Baggage.Events', 'baggage.events')).toBe(false); // case-insensitive
        });

        /**
         * Verifies that invalid topic names are handled properly.
         * The method should:
         * - Return false for empty topics
         * - Return false for invalid topic formats
         */
        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.isDescendant('', 'baggage')).toBe(false);
            expect(TopicUtils.isDescendant('baggage.events', '')).toBe(false);
            expect(TopicUtils.isDescendant('/', 'baggage')).toBe(false);
        });
    });

    /**
     * Tests for topic pattern matching functionality.
     * Verifies the test method properly:
     * - Matches exact topics
     * - Handles wildcard patterns
     * - Processes case sensitivity
     * - Validates input topics
     */
    describe('test', () => {
        /**
         * Verifies that topics match against various patterns correctly.
         * The method should:
         * - Match exact topic names
         * - Match single-level wildcards (*)
         * - Match multi-level wildcards (>)
         * - Handle case-insensitive matching
         */
        it('should return true for matching topics and patterns', () => {
            // Test exact topic matches
            expect(TopicUtils.test('baggage.events', 'baggage.events')).toBe(true);

            // Test single-level wildcard matches
            expect(TopicUtils.test('baggage.events.europe', 'baggage.events.*')).toBe(true);
            expect(TopicUtils.test('baggage.events.europe', 'baggage.*.europe')).toBe(true);

            // Test multi-level wildcard matches
            expect(TopicUtils.test('baggage.events.europe', 'baggage.>')).toBe(true);

            // Test case-insensitive pattern matching
            expect(TopicUtils.test('Baggage.Events', 'baggage.events')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.events.*')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.*.europe')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.>')).toBe(true);
        });

        /**
         * Verifies that non-matching topics and patterns are rejected.
         * The method should:
         * - Reject different topics
         * - Reject non-matching wildcard patterns
         * - Handle case-insensitive comparisons
         */
        it('should return false for non-matching topics and patterns', () => {
            // Test completely different topics
            expect(TopicUtils.test('baggage.events', 'flight.updates')).toBe(false);
            expect(TopicUtils.test('Baggage.Events', 'Flight.Updates')).toBe(false);

            // Test non-matching wildcard patterns
            expect(TopicUtils.test('baggage.scans', 'baggage.events.*')).toBe(false);
            expect(TopicUtils.test('Baggage.Scans', 'baggage.events.*')).toBe(false);

            // Test non-matching exact patterns
            expect(TopicUtils.test('baggage.events.europe', 'baggage.events.asia')).toBe(false);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.events.asia')).toBe(false);
        });

        /**
         * Verifies that invalid topic names are handled properly.
         * The method should:
         * - Return false for empty topics
         * - Return false for invalid topic formats
         */
        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.test('', 'baggage.*')).toBe(false);
            expect(TopicUtils.test(' ', '*')).toBe(false);
        });
    });
});