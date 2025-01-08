import { VERSION } from '@version';

jest.mock('@package.json', () => ({
    version: '1.0.0'
}));

describe('Version', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should use package.json version when available', () => {
        expect(VERSION).toBe('1.0.0');
    });

    it('should fallback to npm_package_version when package.json version is not available', () => {
        jest.resetModules();
        jest.mock('@package.json', () => ({
            version: null
        }));
        process.env.npm_package_version = '2.0.0';

        // Re-import to get fresh version
        const { VERSION } = require('@version');
        expect(VERSION).toBe('2.0.0');
    });
});