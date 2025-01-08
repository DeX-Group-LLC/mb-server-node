import { MessageBroker } from '@core/broker';
import logger from '@utils/logger';

jest.mock('@core/broker');
jest.mock('@utils/logger');

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

        // Mock process.exit
        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        // Setup MessageBroker mock
        mockBroker = {
            shutdown: jest.fn()
        } as unknown as jest.Mocked<MessageBroker>;
        (MessageBroker as jest.Mock).mockImplementation(() => mockBroker);

        // Import server to start it
        require('@server');
    });

    afterAll(() => {
        // Restore all mocks
        jest.restoreAllMocks();
    });

    it('should handle SIGINT signal correctly', async () => {
        // Trigger SIGINT by calling the registered listener directly
        expect(processListeners.SIGINT).toBeDefined();
        expect(processListeners.SIGINT).toHaveLength(1);
        const sigintListener = processListeners.SIGINT[0];
        sigintListener();

        // Verify shutdown was called
        expect(logger.info).toHaveBeenCalledWith('Received SIGINT signal. Shutting down...');
        expect(mockBroker.shutdown).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGTERM signal correctly', async () => {
        // Trigger SIGTERM by calling the registered listener directly
        expect(processListeners.SIGTERM).toBeDefined();
        expect(processListeners.SIGTERM).toHaveLength(1);
        const sigtermListener = processListeners.SIGTERM[0];
        sigtermListener('SIGTERM');

        // Verify shutdown was called
        expect(logger.info).toHaveBeenCalledWith('Received SIGTERM signal. Shutting down...');
        expect(mockBroker.shutdown).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should start server automatically when imported', async () => {
        // Verify server was started by checking signal handlers
        expect(processListeners.SIGINT).toBeDefined();
        expect(processListeners.SIGTERM).toBeDefined();
        expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });
});