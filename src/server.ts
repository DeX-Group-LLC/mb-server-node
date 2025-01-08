import { MessageBroker } from '@core/broker';
import logger from '@utils/logger';

/**
 * Starts the Message Broker server.
 */
async function startServer() {
    const messageBroker = new MessageBroker();

    // Handle shutdown signals
    process.on('SIGINT', () => {
        logger.info('Received SIGINT signal. Shutting down...');
        messageBroker.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM signal. Shutting down...');
        messageBroker.shutdown();
        process.exit(0);
    });
}

// Start the server when this module is imported
startServer();