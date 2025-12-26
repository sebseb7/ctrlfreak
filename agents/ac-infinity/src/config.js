import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

export default {
    // WebSocket server connection
    serverUrl: process.env.SERVER_URL || 'ws://localhost:8080',
    apiKey: process.env.API_KEY || '',

    // AC Infinity credentials
    acEmail: process.env.AC_EMAIL || '',
    acPassword: process.env.AC_PASSWORD || '',

    // Polling interval (default: 60 seconds)
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),

    // AC Infinity API
    acApiHost: process.env.AC_API_HOST || 'http://www.acinfinityserver.com',
};
