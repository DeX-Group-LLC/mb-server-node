import { MessageBroker } from '@core/broker';
import logger from '@utils/logger';

jest.mock('@core/broker');
jest.mock('@utils/logger');

/**
 * Test suite for server initialization and shutdown functionality.
 * Tests the core functionality of server startup and graceful shutdown.
 *
 * Key areas tested:
 * - Signal handling (SIGINT, SIGTERM)
 * - Graceful shutdown process
 * - Automatic server startup
 * - Process exit handling
 */
describe('Server', () => {
    let mockExit: jest.SpyInstance;
    let mockBroker: jest.Mocked<MessageBroker>;
    let processListeners: { [key: string]: ((...args: any[]) => void)[] };
    let processOnSpy: jest.SpyInstance;

    beforeAll(() => {
        // Store original process listeners and spy on process.on
        processListeners = {};
        const originalOn = process.on.bind(process);
        processOnSpy = jest.spyOn(process, 'on').mockImplementation((event: NodeJS.Signals | string | symbol, listener: (...args: any[]) => void) => {
            event = event as string;
            processListeners[event] ??= [];
            processListeners[event].push(listener);
            return originalOn(event, listener);
        });

        // Mock process.exit to prevent actual exit
        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        // Setup MessageBroker mock with shutdown method
        mockBroker = {
            shutdown: jest.fn()
        } as unknown as jest.Mocked<MessageBroker>;
        (MessageBroker as jest.Mock).mockImplementation(() => mockBroker);

        // Import server to trigger initialization
        require('@server');
    });

    afterAll(() => {
        // Restore all mocks to their original state
        jest.restoreAllMocks();
    });

    /**
     * Verifies that SIGINT signals are handled correctly.
     * The server should:
     * - Log the signal reception
     * - Initiate broker shutdown
     * - Exit with code 0
     */
    it('should handle SIGINT signal correctly', async () => {
        // Trigger SIGINT by calling the registered listener directly
        expect(processListeners.SIGINT).toBeDefined();
        expect(processListeners.SIGINT).toHaveLength(1);
        const sigintListener = processListeners.SIGINT[0];
        sigintListener();

        // Verify shutdown sequence was executed
        expect(logger.info).toHaveBeenCalledWith('Received SIGINT signal. Shutting down...');
        expect(mockBroker.shutdown).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
    });

    /**
     * Verifies that SIGTERM signals are handled correctly.
     * The server should:
     * - Log the signal reception
     * - Initiate broker shutdown
     * - Exit with code 0
     */
    it('should handle SIGTERM signal correctly', async () => {
        // Trigger SIGTERM by calling the registered listener directly
        expect(processListeners.SIGTERM).toBeDefined();
        expect(processListeners.SIGTERM).toHaveLength(1);
        const sigtermListener = processListeners.SIGTERM[0];
        sigtermListener('SIGTERM');

        // Verify shutdown sequence was executed
        expect(logger.info).toHaveBeenCalledWith('Received SIGTERM signal. Shutting down...');
        expect(mockBroker.shutdown).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
    });

    /**
     * Verifies that the server starts automatically when imported.
     * The server should:
     * - Register SIGINT handler
     * - Register SIGTERM handler
     * - Set up signal listeners correctly
     */
    it('should start server automatically when imported', async () => {
        // Verify signal handlers were registered
        expect(processListeners.SIGINT).toBeDefined();
        expect(processListeners.SIGTERM).toBeDefined();
        expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });
});