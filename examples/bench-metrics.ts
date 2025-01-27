import { WebSocket } from 'ws';
import { config } from '../src/config';

const MESSAGE = 'request:system.metrics:1.0.0\n{"showAll":true}';
const TOTAL_TIME = 30000;
const INITIAL_BENCHMARK_SIZE = 10000;
const STALL_TIMEOUT = 5000; // Consider test stalled if no messages received for 5 seconds

/**
 * Performs initial benchmark to determine starting message rate
 */
async function performInitialBenchmark(ws: WebSocket): Promise<number> {
    return new Promise((resolve) => {
        let received = 0;
        let sent = 0;
        const startTime = performance.now();
        let lastMessageTime = startTime;

        const messageHandler = () => {
            received++;
            lastMessageTime = performance.now();
            // Send next message when we receive one, maintaining 1 in flight
            if (sent < INITIAL_BENCHMARK_SIZE) {
                ws.send(MESSAGE);
                sent++;
            } else if (received >= INITIAL_BENCHMARK_SIZE) {
                const duration = performance.now() - startTime;
                const rate = Math.floor((INITIAL_BENCHMARK_SIZE / duration) * 1000);
                ws.removeListener('message', messageHandler);
                console.log(`Initial benchmark complete: ${rate} msgs/sec`);
                resolve(rate);
            }
        };

        // Check for stalls during initial benchmark
        const stallChecker = setInterval(() => {
            if (performance.now() - lastMessageTime > STALL_TIMEOUT) {
                console.error(`Initial benchmark stalled! Only received ${received}/${INITIAL_BENCHMARK_SIZE} messages`);
                clearInterval(stallChecker);
                ws.removeListener('message', messageHandler);
                resolve(Math.max(10, Math.floor((received / (performance.now() - startTime)) * 1000)));
            }
        }, 1000);

        ws.on('message', messageHandler);

        // Send first message to start
        ws.send(MESSAGE);
        sent++;
    });
}

/**
 * Performs the main benchmark test with dynamic rate adjustment
 */
async function performMainBenchmark(ws: WebSocket, initialRate: number): Promise<void> {
    return new Promise((resolve) => {
        let messageSentCount = 0;
        let messageReceivedCount = 0;
        let interval: NodeJS.Timeout | null = null;
        const startTime = performance.now();
        let lastMessageTime = startTime;
        let lastReceivedCount = 0;
        let lastAdjustTime = startTime;
        let lastElapsedSeconds = 0;
        let targetRate = initialRate;

        // Monitor for stalls
        const stallChecker = setInterval(() => {
            const now = performance.now();
            if (now - lastMessageTime > STALL_TIMEOUT) {
                console.error(`\nTest stalled! No messages received for ${Math.floor((now - lastMessageTime)/1000)}s`);
                console.error(`Last successful rate: ${Math.floor((lastReceivedCount / ((lastMessageTime - startTime) / 1000)))} msgs/sec`);
                clearInterval(stallChecker);
                if (interval) clearInterval(interval);
                ws.close();
                resolve();
            }
        }, 1000);

        // Send messages at dynamic rate
        interval = setInterval(() => {
            const currentTime = performance.now();
            const elapsedSeconds = (currentTime - startTime) / 1000;
            const deltaSeconds = elapsedSeconds - lastElapsedSeconds;
            lastElapsedSeconds = elapsedSeconds;

            // Calculate rates - both instant and average
            const recentReceived = messageReceivedCount - lastReceivedCount;
            const actualRate = Math.floor(recentReceived / deltaSeconds);
            const instantRate = recentReceived / deltaSeconds;
            const averageRate = messageReceivedCount / elapsedSeconds;
            const inFlightCount = messageSentCount - messageReceivedCount;

            // Use the higher of instant or average rate, with a minimum based on target
            const effectiveRate = Math.max(
                Math.max(instantRate, averageRate),
                targetRate * 0.1  // Minimum 10% of target to avoid complete stalls
            );

            // Adjust target rate based on performance
            if (inFlightCount > effectiveRate * 0.2) {
                // Too many in-flight messages (>20% of rate)
                targetRate = Math.max(10, Math.floor(targetRate * 0.95));
            } else if (inFlightCount < effectiveRate * 0.1 && recentReceived > 0) {
                // Room to grow (<10% in-flight) and receiving messages
                targetRate = Math.min(100000, Math.floor(targetRate * 1.02));
            }

            // Calculate send rate - use effective rate for in-flight limit
            const targetPerInterval = Math.max(1, Math.ceil(targetRate / 100));
            const maxInFlight = Math.max(10, Math.floor(effectiveRate * 0.2));
            const toSend = Math.max(0, Math.min(
                targetPerInterval,  // Don't send more than our target per interval
                maxInFlight - inFlightCount  // Don't exceed max in-flight
            ));

            for (let i = 0; i < toSend; i++) {
                ws.send(MESSAGE);
                messageSentCount++;
            }

            // Log rate every 100ms
            if (currentTime - lastAdjustTime >= 100) {
                console.log(`Rate: ${Math.floor(actualRate)}/s, Sent: ${messageSentCount}, Received: ${messageReceivedCount}, In-flight: ${inFlightCount} (max: ${maxInFlight})`);
                lastAdjustTime = currentTime;
            }
            lastReceivedCount = messageReceivedCount;

            if (currentTime - startTime >= TOTAL_TIME) {
                clearInterval(interval!);
                clearInterval(stallChecker);
                interval = null;
            }
        }, 10);

        // Handle received messages
        const messageHandler = () => {
            messageReceivedCount++;
            lastMessageTime = performance.now();
            if (interval === null && messageReceivedCount >= messageSentCount) {
                const duration = performance.now() - startTime;
                console.log(`\nTest completed:`);
                console.log(`Total messages: ${messageReceivedCount}`);
                console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
                console.log(`Average rate: ${(messageReceivedCount / (duration / 1000)).toFixed(2)} msgs/sec`);
                ws.removeListener('message', messageHandler);
                resolve();
            }
        };

        ws.on('message', messageHandler);

        // Start with a small batch of messages
        const initialBatch = Math.min(100, initialRate);
        for (let i = 0; i < initialBatch; i++) {
            ws.send(MESSAGE);
            messageSentCount++;
        }
    });
}

/**
 * A WebSocket client that sends multiple metrics requests for testing.
 */
async function runBenchmark() {
    const ws = new WebSocket(`ws://${config.host}:${config.ports.websocket}`);

    return new Promise((resolve, reject) => {
        ws.on('open', async () => {
            console.log('Connected to Message Broker');

            try {
                // First perform initial benchmark
                const initialRate = await performInitialBenchmark(ws);

                // Run the main benchmark
                await performMainBenchmark(ws, initialRate);
                ws.close();
            } catch (err) {
                console.error('Benchmark failed:', err);
                ws.close();
                reject(err);
            }
        });

        ws.on('close', () => {
            console.log('Disconnected from Message Broker');
            resolve(undefined);
        });

        ws.on('error', (err: Error) => {
            console.error('WebSocket error:', err);
            if (err.message.includes('ECONNREFUSED')) {
                console.error('Could not connect to the Message Broker. Make sure it is running and the host/port are correct.');
            }
            reject(err);
        });
    });
}

// Run the benchmark test
runBenchmark()
    .then(() => console.log('Benchmark test completed'))
    .catch(err => console.error('Test failed:', err));