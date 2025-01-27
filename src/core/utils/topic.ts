const TOPIC_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){0,4}$/; // Limit to 5 levels deep

export const MAX_TOPIC_LENGTH = 255;

/**
 * Validates a topic name against the defined rules.
 *
 * A valid topic name must:
 * - Be a string with a maximum length of 255 characters.
 * - Start with a lowercase or uppercase letter.
 * - Contain only lowercase or uppercase letters, numbers, and dots (.).
 * - Follow a hierarchical structure using dots as separators (e.g., 'baggage.events.europe').
 * - Have a maximum depth of 5 levels.
 * - Not contain consecutive dots (e.g., 'a..b' is invalid).
 * - Not start or end with a dot.
 *
 * @param name The topic name to validate.
 * @returns True if the topic name is valid, false otherwise.
 */
export function isValid(name: string): boolean {
    if (!name || typeof name !== 'string' || name.length > MAX_TOPIC_LENGTH) return false;
    return TOPIC_NAME_REGEX.test(name);
}

/**
 * Converts a topic name to its canonical form (lowercase).
 *
 * For example:
 * - getCanonical('Baggage.Events') returns 'baggage.events'
 * - getCanonical('Flight.Updates') returns 'flight.updates'
 *
 * @param name The topic name to canonicalize.
 * @returns The canonicalized topic name.
 */
export function getCanonical(name: string): string {
    return name.toLowerCase();
}

/**
 * Gets the parent topic of a given topic.
 *
 * For example:
 * - getParent('baggage.events.europe') returns 'baggage.events'
 * - getParent('a.b.c.d') returns 'a.b.c'
 * - getParent('baggage') returns null
 *
 * @param name The topic name.
 * @returns The parent topic name, or null if it's a top-level topic or an invalid topic name.
 */
export function getParent(name: string): string | null {
    if (!isValid(name)) return null;

    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex === -1) return null;

    return getCanonical(name.substring(0, lastDotIndex));
}

/**
 * Checks if a topic is a direct child of another topic.
 *
 * For example:
 * - isDirectChild('baggage.events.europe', 'baggage.events') returns true
 * - isDirectChild('baggage.events.europe', 'baggage') returns false
 * - isDirectChild('baggage.events', 'baggage.events') returns false
 *
 * @param child The topic name to check.
 * @param parent The potential parent topic name.
 * @returns True if 'child' is a direct child of 'parent', false otherwise.
 */
export function isDirectChild(child: string, parent: string): boolean {
    if (!isValid(child) || !isValid(parent)) return false;

    const canonicalChild = getCanonical(child);
    const canonicalParent = getCanonical(parent);

    const actualParent = getParent(canonicalChild);
    return actualParent === canonicalParent;
}

/**
 * Checks if a topic is a descendant of another topic (direct child or at any level below).
 *
 * For example:
 * - isDescendant('baggage.events.europe', 'baggage.events') returns true
 * - isDescendant('baggage.events.europe', 'baggage') returns true
 * - isDescendant('baggage.events', 'baggage.events.europe') returns false
 *
 * @param descendant The topic name to check.
 * @param ancestor The potential ancestor topic name.
 * @returns True if 'descendant' is a descendant of 'ancestor', false otherwise.
 */
export function isDescendant(descendant: string, ancestor: string): boolean {
    if (!isValid(descendant) || !isValid(ancestor)) return false;

    const canonicalDescendant = getCanonical(descendant);
    const canonicalAncestor = getCanonical(ancestor);

    if (canonicalDescendant === canonicalAncestor) return false;

    return canonicalDescendant.startsWith(canonicalAncestor + '.');
}

/**
 * Tests if a topic matches a given wildcard pattern.
 *
 * Supports two wildcard characters:
 * - '*': Matches any sequence of characters within a single level.
 * - '>': Matches any sequence of characters across multiple levels (must be at the end of the pattern).
 *
 * For example:
 * - test('baggage.events.europe', 'baggage.events.*') returns true
 * - test('baggage.events.europe', 'baggage.*.europe') returns true
 * - test('baggage.events.europe', 'baggage.>') returns true
 * - test('baggage.events.europe', 'flight.>') returns false
 *
 * @param name The topic name to check.
 * @param pattern The wildcard pattern to match against.
 * @returns True if the topic matches the pattern, false otherwise.
 */
export function test(name: string, pattern: string): boolean {
    if (!isValid(name)) return false;

    const canonicalTopic = getCanonical(name);
    const canonicalPattern = getCanonical(pattern);

    // Replace '.' with '\.' for regex escaping
    // Replace '*' with '[^.]+' to match one or more characters except a dot
    // Replace '>' at the end with '.*' to match anything that follows
    const regexPattern = canonicalPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[^.]+')
        .replace(/>$/, '.*');

    // Create a regular expression object
    // The ^ and $ anchors ensure that the entire string is matched
    const regex = new RegExp(`^${regexPattern}$`);

    // Test the topic against the regular expression
    return regex.test(canonicalTopic);
}
