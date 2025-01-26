import { SystemManager } from '@core/system/manager';
import { MonitoringManager } from '@core/monitoring';

describe('SystemManager', () => {
    let systemManager: SystemManager;
    let monitoringManager: MonitoringManager;
    let mockSetInterval: jest.SpyInstance;
    let mockClearInterval: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers();
        mockSetInterval = jest.spyOn(global, 'setInterval');
        mockClearInterval = jest.spyOn(global, 'clearInterval');
        monitoringManager = new MonitoringManager();
        systemManager = new SystemManager(monitoringManager);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('should start collecting metrics at specified interval', () => {
        const intervalMs = 1000;
        systemManager.start(intervalMs);

        expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), intervalMs);
    });

    it('should stop collecting metrics when stopped', () => {
        systemManager.start(1000);
        systemManager.stop();

        expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should collect metrics immediately when started', () => {
        const spy = jest.spyOn(systemManager, 'collectMetrics');
        systemManager.start(1000);

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should collect metrics periodically', () => {
        const spy = jest.spyOn(systemManager, 'collectMetrics');
        systemManager.start(1000);

        jest.advanceTimersByTime(3500);
        expect(spy).toHaveBeenCalledTimes(4); // Initial + 3 intervals
    });

    it('should clean up resources when disposed', () => {
        const stopSpy = jest.spyOn(systemManager, 'stop');
        systemManager.dispose();

        expect(stopSpy).toHaveBeenCalled();
    });
});