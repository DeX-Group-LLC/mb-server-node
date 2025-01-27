import { isUUID4 } from '@core/utils/uuid4';

/**
 * Test suite for UUID4 validation functionality.
 * Tests the validation of UUID4 strings using various test cases.
 */
describe('UUID4 Validation', () => {
    /**
     * Tests valid UUID4 strings.
     * Should return true for properly formatted UUID4 strings.
     */
    it('should validate correct UUID4 strings', () => {
        expect(isUUID4('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
        expect(isUUID4('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        expect(isUUID4('ffffffff-ffff-4fff-ffff-ffffffffffff')).toBe(true);
        expect(isUUID4('00000000-0000-4000-0000-000000000000')).toBe(true);
    });

    /**
     * Tests invalid UUID4 strings.
     * Should return false for improperly formatted strings.
     */
    it('should reject invalid UUID4 strings', () => {
        expect(isUUID4('')).toBe(false); // empty string
        expect(isUUID4('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1')).toBe(false); // too short
        expect(isUUID4('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a111')).toBe(false); // too long
        expect(isUUID4('g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(false); // invalid character
        expect(isUUID4('a0eebc999c0b4ef8bb6d6bb9bd380a11')).toBe(false); // missing hyphens
        expect(isUUID4('a0eebc99_9c0b_4ef8_bb6d_6bb9bd380a11')).toBe(false); // wrong separator
    });
});