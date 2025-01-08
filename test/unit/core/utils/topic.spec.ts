import { TopicUtils } from '@core/utils';

// Mock external dependencies
jest.mock('@utils/logger');

describe('TopicUtils', () => {
    describe('isValid', () => {
        it('should return true for valid topic names', () => {
            // Test various valid topic name formats
            // Basic two-level topic
            expect(TopicUtils.isValid('baggage.events')).toBe(true);
            expect(TopicUtils.isValid('flight.updates')).toBe(true);

            // Multi-level topics
            expect(TopicUtils.isValid('baggage.events.europe')).toBe(true);
            expect(TopicUtils.isValid('a.b.c.d')).toBe(true);

            // Mixed case (case-insensitive validation)
            expect(TopicUtils.isValid('Valid.Topic')).toBe(true);
        });

        it('should return false for invalid topic names', () => {
            // Test empty and whitespace
            expect(TopicUtils.isValid('')).toBe(false);
            expect(TopicUtils.isValid(' ')).toBe(false);

            // Test invalid characters (slashes)
            expect(TopicUtils.isValid('/')).toBe(false);
            expect(TopicUtils.isValid('//')).toBe(false);
            expect(TopicUtils.isValid('baggage//events')).toBe(false);
            expect(TopicUtils.isValid('/baggage')).toBe(false);
            expect(TopicUtils.isValid('baggage/')).toBe(false);
            expect(TopicUtils.isValid('baggage/events/')).toBe(false);
            expect(TopicUtils.isValid('baggage//events/europe')).toBe(false);

            // Test invalid dot patterns
            expect(TopicUtils.isValid('.')).toBe(false);
            expect(TopicUtils.isValid('a.')).toBe(false);
            expect(TopicUtils.isValid('.a')).toBe(false);
            expect(TopicUtils.isValid('a..')).toBe(false);
            expect(TopicUtils.isValid('..a')).toBe(false);

            // Test invalid characters (hyphens)
            expect(TopicUtils.isValid('valid-topic')).toBe(false);

            // Test length constraint
            const longTopic = 'a'.repeat(256);  // Topic name longer than 255 characters
            expect(TopicUtils.isValid(longTopic)).toBe(false);
        });
    });

    describe('getCanonical', () => {
        it('should return lowercase version of topic name', () => {
            // Test various case combinations are converted to lowercase
            expect(TopicUtils.getCanonical('baggage.EVENTS')).toBe('baggage.events');
            expect(TopicUtils.getCanonical('Flight.Updates')).toBe('flight.updates');
            expect(TopicUtils.getCanonical('A.b.C.d')).toBe('a.b.c.d');
        });
    });

    describe('getParent', () => {
        it('should return the parent topic for valid child topics', () => {
            // Test getting parent from multi-level topics
            expect(TopicUtils.getParent('baggage.events.europe')).toBe('baggage.events');
            expect(TopicUtils.getParent('a.b.c.d')).toBe('a.b.c');

            // Test case-insensitive parent resolution
            expect(TopicUtils.getParent('Baggage.Events.Europe')).toBe('baggage.events');
            expect(TopicUtils.getParent('A.b.C.d')).toBe('a.b.c');
        });

        it('should return null for top-level topics', () => {
            // Test single-level topics (no parent)
            expect(TopicUtils.getParent('baggage')).toBe(null);
            expect(TopicUtils.getParent('a')).toBe(null);

            // Test case-insensitive single-level topics
            expect(TopicUtils.getParent('Baggage')).toBe(null);
            expect(TopicUtils.getParent('A')).toBe(null);
        });

        it('should return null for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.getParent('')).toBe(null);
            expect(TopicUtils.getParent(' ')).toBe(null);
            expect(TopicUtils.getParent('/')).toBe(null);
        });
    });

    describe('isDirectChild', () => {
        it('should return true if a topic is a direct child of another topic', () => {
            // Test direct parent-child relationships
            expect(TopicUtils.isDirectChild('baggage.events.europe', 'baggage.events')).toBe(true);
            expect(TopicUtils.isDirectChild('a.b.c', 'a.b')).toBe(true);

            // Test case-insensitive direct relationships
            expect(TopicUtils.isDirectChild('Baggage.Events.Europe', 'Baggage.Events')).toBe(true);
            expect(TopicUtils.isDirectChild('A.b.c', 'A.b')).toBe(true);
        });

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

        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.isDirectChild('', 'baggage')).toBe(false);
            expect(TopicUtils.isDirectChild('baggage.events', '')).toBe(false);
            expect(TopicUtils.isDirectChild('/', 'baggage')).toBe(false);
        });
    });

    describe('isDescendant', () => {
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

        it('should return false if a topic is not a descendant of another topic', () => {
            // Test unrelated topics
            expect(TopicUtils.isDescendant('a.b.c', 'a.c')).toBe(false);
            expect(TopicUtils.isDescendant('A.b.c', 'A.c')).toBe(false);

            // Test reverse relationships (parent is not descendant of child)
            expect(TopicUtils.isDescendant('baggage.events', 'baggage.events.europe')).toBe(false);
            expect(TopicUtils.isDescendant('a.b', 'a.b.c')).toBe(false);
            expect(TopicUtils.isDescendant('Baggage.Events', 'Baggage.Events.Europe')).toBe(false);
            expect(TopicUtils.isDescendant('A.b', 'A.b.c')).toBe(false);

            // Test topic compared with itself (a topic is not its own descendant)
            expect(TopicUtils.isDescendant('baggage.events', 'baggage.events')).toBe(false);
            expect(TopicUtils.isDescendant('a.b', 'a.b')).toBe(false);
            expect(TopicUtils.isDescendant('Baggage.Events', 'baggage.events')).toBe(false); // case-insensitive
        });

        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.isDescendant('', 'baggage')).toBe(false);
            expect(TopicUtils.isDescendant('baggage.events', '')).toBe(false);
            expect(TopicUtils.isDescendant('/', 'baggage')).toBe(false);
        });
    });

    describe('test', () => {
        it('should return true for matching topics and patterns', () => {
            // Test exact matches
            expect(TopicUtils.test('baggage.events', 'baggage.events')).toBe(true);

            // Test single-level wildcard (*)
            expect(TopicUtils.test('baggage.events.europe', 'baggage.events.*')).toBe(true);
            expect(TopicUtils.test('baggage.events.europe', 'baggage.*.europe')).toBe(true);

            // Test multi-level wildcard (>)
            expect(TopicUtils.test('baggage.events.europe', 'baggage.>')).toBe(true);

            // Test case-insensitive matching
            expect(TopicUtils.test('Baggage.Events', 'baggage.events')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.events.*')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.*.europe')).toBe(true);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.>')).toBe(true);
        });

        it('should return false for non-matching topics and patterns', () => {
            // Test completely different topics
            expect(TopicUtils.test('baggage.events', 'flight.updates')).toBe(false);
            expect(TopicUtils.test('Baggage.Events', 'Flight.Updates')).toBe(false);

            // Test non-matching wildcards
            expect(TopicUtils.test('baggage.scans', 'baggage.events.*')).toBe(false);
            expect(TopicUtils.test('Baggage.Scans', 'baggage.events.*')).toBe(false);

            // Test non-matching exact patterns
            expect(TopicUtils.test('baggage.events.europe', 'baggage.events.asia')).toBe(false);
            expect(TopicUtils.test('Baggage.Events.Europe', 'baggage.events.asia')).toBe(false);
        });

        it('should return false for invalid topic names', () => {
            // Test invalid topic formats
            expect(TopicUtils.test('', 'baggage.*')).toBe(false);
            expect(TopicUtils.test(' ', '*')).toBe(false);
        });
    });
});