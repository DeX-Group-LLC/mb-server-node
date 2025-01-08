import * as winston from 'winston';
import { config } from '@config';

/**
 * Creates a Winston logger instance configured based on the application's
 * configuration.
 */
const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json() // Consider winston.format.prettyPrint() for development
    ),
    transports: [
        new winston.transports.Console(),
        // You can add other transports here (e.g., file transport)
    ],
});

export default logger;