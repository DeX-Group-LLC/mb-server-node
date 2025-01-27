# Monitoring Guide

This guide explains how to monitor and maintain MB Server Node in production.

## Monitoring Setup

### Enable Monitoring

```yaml
# Monitoring configuration in config.yaml
monitoring:
  interval: 60000  # Metrics collection interval in milliseconds
```

Or via environment variables:
```bash
MB_MONITORING_INTERVAL=60000
```

### Available Metrics

1. **Connection Metrics**
   - `mb_connections_total{type="websocket|tcp"}` - Total active connections by type
   - `mb_connections_max{type="websocket|tcp"}` - Maximum concurrent connections
   - `mb_connections_errors_total{type="websocket|tcp",reason="auth|timeout|error"}` - Connection errors by type and reason
   - `mb_auth_failures_total` - Authentication failures

2. **Message Metrics**
   - `mb_messages_total{type="request|response|publish"}` - Total messages by type
   - `mb_messages_size_bytes{type="request|response|publish"}` - Message size distribution
   - `mb_messages_errors_total{type="validation|size|format"}` - Message errors by type
   - `mb_messages_latency_ms{type="request|response"}` - Message processing latency

3. **Service Metrics**
   - `mb_services_total` - Total registered services
   - `mb_services_requests_total{service="name"}` - Requests per service
   - `mb_services_errors_total{service="name",type="timeout|error"}` - Service errors
   - `mb_services_latency_ms{service="name"}` - Service response time

4. **Topic Metrics**
   - `mb_topics_total` - Total active topics
   - `mb_topics_messages_total{topic="name"}` - Messages per topic
   - `mb_topics_subscribers_total{topic="name"}` - Subscribers per topic
   - `mb_topics_errors_total{topic="name"}` - Topic-related errors

5. **Rate Limiting Metrics**
   - `mb_rate_limit_exceeded_total{type="service|topic"}` - Rate limit exceeded events
   - `mb_rate_current{type="service|topic"}` - Current rate per service/topic

6. **System Metrics**
   - `mb_system_uptime_seconds` - Server uptime
   - `process_cpu_usage` - CPU usage percentage
   - `process_resident_memory_bytes` - Memory usage
   - `nodejs_eventloop_lag_seconds` - Event loop lag

## Prometheus Integration

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: 'mb-server'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_interval: 60s
    evaluation_interval: 60s
```

### Example PromQL Queries

1. **Connection Rate**
   ```promql
   # Connection rate over 5 minutes
   rate(mb_connections_total[5m])
   ```

2. **Message Throughput**
   ```promql
   # Messages per second by type
   sum by (type) (rate(mb_messages_total[1m]))
   ```

3. **Error Rate**
   ```promql
   # Error rate by type
   sum by (type) (rate(mb_messages_errors_total[5m]))
   ```

4. **Service Latency**
   ```promql
   # 95th percentile service latency
   histogram_quantile(0.95, sum(rate(mb_services_latency_ms_bucket[5m])) by (le, service))
   ```

## Grafana Dashboards

### Overview Dashboard

```json
{
  "dashboard": {
    "title": "MB Server Overview",
    "panels": [
      {
        "title": "Active Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "sum by (type) (mb_connections_total)"
          }
        ]
      },
      {
        "title": "Message Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum by (type) (rate(mb_messages_total[1m]))"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum by (type) (rate(mb_messages_errors_total[5m]))"
          }
        ]
      },
      {
        "title": "Service Latency",
        "type": "heatmap",
        "targets": [
          {
            "expr": "sum(rate(mb_services_latency_ms_bucket[5m])) by (le, service)"
          }
        ]
      }
    ]
  }
}
```

### Alert Rules

```yaml
groups:
  - name: mb-server
    rules:
      - alert: HighConnectionCount
        expr: sum(mb_connections_total) > mb_connections_max * 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High connection count"
          description: "Connection count is approaching the maximum limit"

      - alert: HighErrorRate
        expr: sum(rate(mb_messages_errors_total[5m])) > 10
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "High error rate"
          description: "Message error rate is above threshold"

      - alert: ServiceLatencyHigh
        expr: histogram_quantile(0.95, sum(rate(mb_services_latency_ms_bucket[5m])) by (le, service)) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High service latency"
          description: "95th percentile service latency is above 1s"
```

## Logging

### Log Configuration

```yaml
# Logging configuration in config.yaml
logging:
  level: 'info'   # Log level (debug, info, warn, error)
  format: 'json'  # Log format (json, text)
```

Or via environment variables:
```bash
MB_LOGGING_LEVEL=info
MB_LOGGING_FORMAT=json
```

### Log Format

```json
{
  "timestamp": "2024-01-20T12:00:00.000Z",
  "level": "info",
  "event": "message_received",
  "topic": "user.events",
  "size": 1024,
  "client_id": "client-123",
  "service": "user-service",
  "latency": 50
}
```

## Best Practices

1. **Monitoring Setup**
   - Configure appropriate metrics collection interval
   - Set up comprehensive alerting
   - Use structured logging in production
   - Monitor all critical components

2. **Performance Monitoring**
   - Track connection counts and limits
   - Monitor message rates and sizes
   - Measure service latencies
   - Watch system resources

3. **Error Tracking**
   - Monitor authentication failures
   - Track rate limit violations
   - Log connection errors
   - Watch for high latency

4. **Resource Management**
   - Monitor memory usage
   - Track CPU utilization
   - Watch event loop lag
   - Monitor disk usage

5. **Alerting**
   - Set appropriate thresholds
   - Configure proper notification channels
   - Define escalation procedures
   - Document response actions

6. **Log Management**
   - Implement log rotation
   - Set up log aggregation
   - Configure retention policies
   - Monitor log volume