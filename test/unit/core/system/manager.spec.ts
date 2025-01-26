import { SystemManager } from '@core/system/manager';
import { MonitoringManager } from '@core/monitoring';

// Mock the logger
jest.mock('@utils/logger', () => ({
    SetupLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

// Mock the SystemManager to prevent auto-start
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

describe('SystemManager', () => {
    let systemManager: SystemManager;
    let monitoringManager: MonitoringManager;

    beforeEach(() => {
        jest.useFakeTimers();
        monitoringManager = new MonitoringManager();
        systemManager = new SystemManager(monitoringManager);
    });

    afterEach(() => {
        // Stop the system manager before restoring timers
        systemManager.stop();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('should start collecting metrics at specified interval', () => {
        const intervalMs = 1000;
        systemManager.start(intervalMs);

        expect(jest.getTimerCount()).toBe(1);
    });

    it('should stop collecting metrics when stopped', () => {
        systemManager.start(1000);
        const timerCount = jest.getTimerCount();
        systemManager.stop();

        expect(jest.getTimerCount()).toBe(timerCount - 1);
    });

    it('should collect metrics immediately when started', () => {
        // Mock process.cpuUsage to return consistent values
        const mockCpuUsage = jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 100, system: 100 });

        systemManager.start(1000);

        // Verify that metrics were collected immediately
        expect(mockCpuUsage).toHaveBeenCalledTimes(1);
        mockCpuUsage.mockRestore();
    });

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

    it('should handle restarting metrics collection after stopping', () => {
        // Start initial collection
        systemManager.start(1000);
        expect(jest.getTimerCount()).toBe(1);

        // Stop collection
        systemManager.stop();
        expect(jest.getTimerCount()).toBe(0);

        // Restart collection
        systemManager.start(2000);
        expect(jest.getTimerCount()).toBe(1);

        // Force another start, to ensure the interval is reset:
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