import { MonitoringManager } from '@core/monitoring';
import { Metric } from '@core/monitoring';
import { GaugeSlot, RateSlot } from '@core/monitoring/metrics/slots';

/**
 * Manages metrics for the connection module.
 */
export class ConnectionMetrics {
    private activeConnections: Metric;
    private connectionConnectedRate: Metric;
    private connectionConnectedTotal: Metric;
    private connectionDisconnectedRate: Metric;
    private connectionDisconnectedTotal: Metric;
    private connectionFailedRate: Metric;
    private connectionFailedTotal: Metric;
    private connectionRejectedRate: Metric;
    private connectionRejectedTotal: Metric;

    constructor(private monitorManager: MonitoringManager) {
        // Initialize all metrics
        this.activeConnections = this.monitorManager.registerMetric('connection.active', GaugeSlot);
        this.connectionConnectedRate = this.monitorManager.registerMetric('connection.connected.rate', RateSlot);
        this.connectionConnectedTotal = this.monitorManager.registerMetric('connection.connected.total', GaugeSlot);
        this.connectionDisconnectedRate = this.monitorManager.registerMetric('connection.disconnected.rate', RateSlot);
        this.connectionDisconnectedTotal = this.monitorManager.registerMetric('connection.disconnected.total', GaugeSlot);
        this.connectionFailedRate = this.monitorManager.registerMetric('connection.failed.rate', RateSlot);
        this.connectionFailedTotal = this.monitorManager.registerMetric('connection.failed.total', GaugeSlot);
        this.connectionRejectedRate = this.monitorManager.registerMetric('connection.rejected.rate', RateSlot);
        this.connectionRejectedTotal = this.monitorManager.registerMetric('connection.rejected.total', GaugeSlot);
    }

    /**
     * Updates metrics when a new connection is established
     */
    onConnectionEstablished(): void {
        this.activeConnections.slot.add(1);
        this.connectionConnectedRate.slot.add(1);
        this.connectionConnectedTotal.slot.add(1);
    }

    /**
     * Updates metrics when a connection is closed (gracefully or ungracefully)
     */
    onConnectionClosed(): void {
        this.activeConnections.slot.add(-1);
        this.connectionDisconnectedRate.slot.add(1);
        this.connectionDisconnectedTotal.slot.add(1);
    }

    /**
     * Updates metrics when a connection attempt fails
     */
    onConnectionFailed(): void {
        this.connectionFailedRate.slot.add(1);
        this.connectionFailedTotal.slot.add(1);
    }

    /**
     * Updates metrics when a connection attempt is rejected
     */
    onConnectionRejected(): void {
        this.connectionRejectedRate.slot.add(1);
        this.connectionRejectedTotal.slot.add(1);
    }
}