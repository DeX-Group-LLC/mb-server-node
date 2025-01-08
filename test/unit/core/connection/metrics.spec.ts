/**
 * Test suite for ConnectionMetrics class.
 * Tests the monitoring functionality for connection-related events:
 * - Connection establishment
 * - Connection closure
 * - Connection failures
 * - Connection rejections
 */
import { jest } from '@jest/globals';
import { ConnectionMetrics } from '@core/connection/metrics';
import { MonitoringManager } from '@core/monitoring';

describe('ConnectionMetrics', () => {
    let metrics: ConnectionMetrics;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockMetric: any;

    beforeEach(() => {
        // Create mock metric with a slot that tracks metric values
        mockMetric = {
            slot: {
                add: jest.fn(),      // Mock for incrementing/decrementing values
                value: 0,            // Current value of the metric
                reset: jest.fn(),    // Mock for resetting the metric
                dispose: jest.fn(),  // Mock for cleanup
            }
        };

        // Create mock monitor manager that returns our mock metric
        mockMonitorManager = {
            registerMetric: jest.fn().mockReturnValue(mockMetric),  // Always returns the same mock metric
            dispose: jest.fn(),                                     // Mock for cleanup
        } as unknown as jest.Mocked<MonitoringManager>;

        // Create a fresh ConnectionMetrics instance for each test
        metrics = new ConnectionMetrics(mockMonitorManager);
    });

    /**
     * Tests for connection establishment metrics.
     * Verifies that active connections count is incremented
     * and connection rate metrics are updated.
     */
    describe('onConnectionEstablished', () => {
        it('should update metrics when connection is established', () => {
            // Trigger connection established event
            metrics.onConnectionEstablished();

            // Verify metric was incremented by 1
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);
        });
    });

    /**
     * Tests for connection closure metrics.
     * Verifies that:
     * - Active connections count is decremented
     * - Disconnection rate is incremented
     * - Total disconnections is incremented
     */
    describe('onConnectionClosed', () => {
        it('should update metrics when connection is closed', () => {
            // Trigger connection closed event
            metrics.onConnectionClosed();

            // Verify active connections was decremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(-1); // activeConnections

            // Verify disconnection metrics were incremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);  // disconnectedRate and total
        });
    });

    /**
     * Tests for connection failure metrics.
     * Verifies that failure counters are incremented
     * when a connection attempt fails.
     */
    describe('onConnectionFailed', () => {
        it('should update metrics when connection fails', () => {
            // Trigger connection failed event
            metrics.onConnectionFailed();

            // Verify failure metric was incremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);
        });
    });

    /**
     * Tests for connection rejection metrics.
     * Verifies that rejection counters are incremented
     * when a connection is actively rejected.
     */
    describe('onConnectionRejected', () => {
        it('should update metrics when connection is rejected', () => {
            // Trigger connection rejected event
            metrics.onConnectionRejected();

            // Verify rejection metric was incremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);
        });
    });
});