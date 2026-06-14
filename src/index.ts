/**
 * Second Life Commerce — Application Entry Point
 *
 * Starts the unified Express API server with all modules wired together.
 */

import 'dotenv/config';
import { startServer } from './server.js';

startServer();
