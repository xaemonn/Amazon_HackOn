/**
 * Second Life Commerce — Application Entry Point
 *
 * Starts the Express API server for the Zero-Touch Returns flow.
 */

import 'dotenv/config';
import { startServer } from './presentation/api/server.js';

startServer();
