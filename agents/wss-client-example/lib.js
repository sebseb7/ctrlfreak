import WebSocket from 'ws';

/**
 * A simple client for the TischlerCtrl WebSocket API.
 */
export class TischlerClient {
    /**
     * @param {string} url - The WebSocket server URL (e.g., 'ws://localhost:3000')
     * @param {string} apiKey - Your Agent API Key
     */
    constructor(url, apiKey) {
        this.url = url;
        this.apiKey = apiKey;
        this.ws = null;
        this.authenticated = false;
        this.onAuthenticated = null; // Callback
    }

    /**
     * Connect to the WebSocket server.
     * @returns {Promise<void>} Resolves when connected (but not yet authenticated)
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                console.log('[Client] Connected to server.');
                this.authenticate();
                resolve();
            });

            this.ws.on('message', (data) => this.handleMessage(data));

            this.ws.on('error', (err) => {
                console.error('[Client] Connection error:', err.message);
                reject(err);
            });

            this.ws.on('close', () => {
                console.log('[Client] Disconnected.');
                this.authenticated = false;
            });
        });
    }

    /**
     * Send authentication message.
     */
    authenticate() {
        console.log('[Client] Authenticating...');
        this.send({
            type: 'auth',
            apiKey: this.apiKey
        });
    }

    /**
     * Send sensor readings.
     * @param {Array<Object>} readings - Array of reading objects
     * @example
     * client.sendReadings([
     *   { device: 'temp-sensor-1', channel: 'temp', value: 24.5 },
     *   { device: 'temp-sensor-1', channel: 'config', data: { mode: 'eco' } }
     * ]);
     */
    sendReadings(readings) {
        if (!this.authenticated) {
            console.warn('[Client] Cannot send data: Not authenticated.');
            return;
        }

        console.log(`[Client] Sending ${readings.length} readings...`);
        this.send({
            type: 'data',
            readings: readings
        });
    }

    /**
     * Handle incoming messages.
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'auth':
                    if (message.success) {
                        this.authenticated = true;
                        console.log(`[Client] Authenticated as "${message.name}" (Prefix: ${message.devicePrefix})`);
                        if (this.onAuthenticated) this.onAuthenticated();
                    } else {
                        console.error('[Client] Authentication failed:', message.error);
                        this.ws.close();
                    }
                    break;

                case 'ack':
                    console.log(`[Client] Server acknowledged ${message.count} readings.`);
                    break;

                case 'error':
                    console.error('[Client] Server error:', message.error);
                    break;

                default:
                    console.log('[Client] Received:', message);
            }
        } catch (err) {
            console.error('[Client] Failed to parse message:', err);
        }
    }

    /**
     * Helper to send JSON object.
     */
    send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    /**
     * Close connection.
     */
    close() {
        if (this.ws) this.ws.close();
    }
}
