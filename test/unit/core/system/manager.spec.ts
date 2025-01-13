import { MonitoringManager } from '@core/monitoring/manager';
import { SystemManager } from '@core/system/manager';

jest.useFakeTimers();

describe('SystemManager', () => {
    let monitoringManager: MonitoringManager;
    let systemManager: SystemManager;

    beforeEach(() => {
        monitoringManager = new MonitoringManager();
        systemManager = new SystemManager(monitoringManager);
    });

    afterEach(() => {
        systemManager.dispose();
        jest.clearAllTimers();
    });

    it('should start collecting metrics at specified interval', () => {
        const intervalMs = 2000;
        systemManager.start(intervalMs);

        expect(setInterval).toHaveBeenCalledWith(expect.any(Function), intervalMs);
    });

    it('should stop collecting metrics when stopped', () => {
        systemManager.start();
        systemManager.stop();

        expect(clearInterval).toHaveBeenCalled();
    });

    it('should collect metrics immediately when started', () => {
        const spy = jest.spyOn(systemManager as any, 'collectMetrics');
        systemManager.start();

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should collect metrics periodically', () => {
        const spy = jest.spyOn(systemManager as any, 'collectMetrics');
        systemManager.start(1000);

        jest.advanceTimersByTime(3500);
        expect(spy).toHaveBeenCalledTimes(4); // Initial + 3 intervals
    });

    it('should clean up resources when disposed', () => {
        const stopSpy = jest.spyOn(systemManager, 'stop');
        systemManager.start();
        systemManager.dispose();

        expect(stopSpy).toHaveBeenCalled();
    });
});