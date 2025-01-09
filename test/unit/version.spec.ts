import { VERSION } from '@version';

jest.mock('@package.json', () => ({
    version: '1.0.0'
}));

/**
 * Test suite for the VERSION module.
 *
 * This suite verifies that the VERSION constant correctly retrieves the application's version number
 * from either the `package.json` file or the `npm_package_version` environment variable,
 * depending on which is available.
 */
describe('Version', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    /**
     * Tests that VERSION correctly retrieves the version from `package.json` when it's available.
     *
     * @test {VERSION}
     */
    it('should use package.json version when available', () => {
        // Verify that VERSION matches the mocked package.json version
        expect(VERSION).toBe('1.0.0');
    });

    /**
     * Tests that VERSION falls back to `npm_package_version` when the `package.json` version is not available.
     *
     * @test {VERSION}
     */
    it('should fallback to npm_package_version when package.json version is not available', () => {
        // Reset modules and mock package.json to simulate its absence
        jest.resetModules();
        jest.mock('@package.json', () => ({
            version: null
        }));
        // Set the npm_package_version environment variable
        process.env.npm_package_version = '2.0.0';

        // Re-import VERSION to get the updated value
        const { VERSION } = require('@version');
        // Verify that VERSION matches the npm_package_version environment variable
        expect(VERSION).toBe('2.0.0');
    });
});