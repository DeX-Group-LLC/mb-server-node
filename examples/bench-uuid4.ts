import { randomUUID } from 'crypto';

const MESSAGES = 100 * 1000 * 1000;

/**
 * A WebSocket client that sends multiple metrics requests for testing.
 */
async function runBenchmark() {
    const start = performance.now();

    for (let i = 0; i < MESSAGES; i++) {
        randomUUID();
    }

    const end = performance.now();
    console.log(`Time taken: ${(end - start) / 1000}s`);
    console.log(`Rate: ${Math.floor((MESSAGES / ((end - start) / 1000)) * 1000).toLocaleString()} gen/sec`);
}

// Run the benchmark test
runBenchmark()
    .then(() => console.log('Benchmark test completed'))
    .catch(err => console.error('Test failed:', err));