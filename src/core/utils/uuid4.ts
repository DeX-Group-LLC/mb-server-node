const UUID4_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/**
 * Validates a UUID4 string.
 * @param uuid The UUID4 string to validate.
 * @returns True if the UUID4 string is valid, false otherwise.
 */
export function isUUID4(uuid: string): boolean {
    if (!uuid) return false;
    return UUID4_REGEX.test(uuid);
}