import { SystemManager } from '@core/system/manager';
import { MonitoringManager } from '@core/monitoring';

/**
 * Mock setup for the logger to prevent actual logging during tests
 */
jest.mock('@utils/logger', () => ({
    SetupLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

/**
 * Mock setup for the SystemManager to prevent auto-start behavior during tests
 */
jest.mock('@core/system/manager', () => {
    const actual = jest.requireActual('@core/system/manager');
    return {
        ...actual,
        SystemManager: class extends actual.SystemManager {
            constructor(monitoringManager: MonitoringManager) {
                super(monitoringManager);
                // Override auto-start behavior
                this.stop();
            }
        }
    };
});

/**
 * Test suite for the SystemManager class.
 * Verifies the functionality of system metrics collection, including:
 * - Starting and stopping metrics collection
 * - Periodic metrics updates
 * - Resource cleanup
 */
describe('SystemManager', () => {
    let systemManager: SystemManager;
    let monitoringManager: MonitoringManager;

    /**
     * Test setup before each test case:
     * - Sets up fake timers for controlled time advancement
     * - Creates fresh instances of MonitoringManager and SystemManager
     */
    beforeEach(() => {
        jest.useFakeTimers();
        monitoringManager = new MonitoringManager();
        systemManager = new SystemManager(monitoringManager);
    });

    /**
     * Test cleanup after each test case:
     * - Stops the system manager
     * - Cleans up timers
     * - Restores real timers
     */
    afterEach(() => {
        // Stop the system manager before restoring timers
        systemManager.stop();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    /**
     * Verifies that metrics collection starts at the specified interval
     */
    it('should start collecting metrics at specified interval', () => {
        const intervalMs = 1000;
        systemManager.start(intervalMs);

        expect(jest.getTimerCount()).toBe(1);
    });

    /**
     * Verifies that metrics collection stops when the manager is stopped
     */
    it('should stop collecting metrics when stopped', () => {
        systemManager.start(1000);
        const timerCount = jest.getTimerCount();
        systemManager.stop();

        expect(jest.getTimerCount()).toBe(timerCount - 1);
    });

    /**
     * Verifies that metrics are collected immediately when the manager starts,
     * without waiting for the first interval
     */
    it('should collect metrics immediately when started', () => {
        // Mock process.cpuUsage to return consistent values
        const mockCpuUsage = jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 100, system: 100 });

        systemManager.start(1000);

        // Verify that metrics were collected immediately
        expect(mockCpuUsage).toHaveBeenCalledTimes(1);
        mockCpuUsage.mockRestore();
    });

    /**
     * Verifies that metrics are collected at regular intervals after starting
     */
    it('should collect metrics periodically', () => {
        // Mock process.cpuUsage to return consistent values
        const mockCpuUsage = jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 100, system: 100 });

        systemManager.start(1000);
        mockCpuUsage.mockClear(); // Clear the initial call

        // Advance time by 3 intervals
        jest.advanceTimersByTime(3000);

        // Should be called 3 times (once per interval)
        expect(mockCpuUsage).toHaveBeenCalledTimes(3);
        mockCpuUsage.mockRestore();
    });

    /**
     * Verifies that all resources are properly cleaned up when the manager is disposed
     */
    it('should clean up resources when disposed', () => {
        // Check that no timers are running
        expect(jest.getTimerCount()).toBe(0);

        // Start collection
        systemManager.start(1000);
        expect(jest.getTimerCount()).toBe(1);

        // Dispose
        systemManager.dispose();

        // After dispose, all timers should be cleared
        expect(jest.getTimerCount()).toBe(0);
    });

    /**
     * Verifies that metrics collection can be restarted after stopping,
     * and that the collection interval can be changed
     */
    it('should handle restarting metrics collection after stopping', () => {
        // Start initial collection
        systemManager.start(1000);
        expect(jest.getTimerCount()).toBe(1);

        // Stop collection
        systemManager.stop();
        expect(jest.getTimerCount()).toBe(0);

        // Restart collection with new interval
        systemManager.start(2000);
        expect(jest.getTimerCount()).toBe(1);

        // Force another start, to ensure the interval is reset
        systemManager.start(2000);
        expect(jest.getTimerCount()).toBe(1);

        // Verify metrics are being collected with new interval
        const mockCpuUsage = jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 100, system: 100 });
        mockCpuUsage.mockClear();

        jest.advanceTimersByTime(2000);
        expect(mockCpuUsage).toHaveBeenCalledTimes(1);
        mockCpuUsage.mockRestore();
    });
});