import WebSocket from 'ws';

/**
 * WebSocket client with auto-reconnect and authentication
 */
export class WSClient {
    constructor(url, apiKey, options = {}) {
        this.url = url;
        this.apiKey = apiKey;
        this.options = {
            reconnectBaseMs: options.reconnectBaseMs || 1000,
            reconnectMaxMs: options.reconnectMaxMs || 60000,
            pingIntervalMs: options.pingIntervalMs || 30000,
            ...options,
        };

        this.ws = null;
        this.authenticated = false;
        this.devicePrefix = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.messageQueue = [];
        this.onReadyCallback = null;
        this.onCommandCallback = null;
    }

    onCommand(callback) {
        this.onCommandCallback = callback;
    }

    /**
     * Connect to the WebSocket server
     * @returns {Promise} Resolves when authenticated
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.onReadyCallback = resolve;
            this._connect();
        });
    }

    _connect() {
        console.log(`[WS] Connecting to ${this.url}...`);

        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            console.log('[WS] Connected, authenticating...');
            this.reconnectAttempts = 0;

            // Send authentication
            this._send({ type: 'auth', apiKey: this.apiKey });
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this._handleMessage(message);
            } catch (err) {
                console.error('[WS] Error parsing message:', err.message);
            }
        });

        this.ws.on('ping', () => {
            this.ws.pong();
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[WS] Connection closed: ${code} ${reason}`);
            this._cleanup();
            this._scheduleReconnect();
        });

        this.ws.on('error', (err) => {
            console.error('[WS] Error:', err.message);
        });
    }

    _handleMessage(message) {
        switch (message.type) {
            case 'auth':
                if (message.success) {
                    console.log(`[WS] Authenticated as ${message.name}`);
                    this.authenticated = true;
                    this.devicePrefix = message.devicePrefix;

                    // Start ping timer
                    this._startPingTimer();

                    // Flush queued messages
                    this._flushQueue();

                    // Resolve connect promise
                    if (this.onReadyCallback) {
                        this.onReadyCallback();
                        this.onReadyCallback = null;
                    }
                } else {
                    console.error('[WS] Authentication failed:', message.error);
                }
                break;

            case 'ack':
                // Data acknowledged
                break;

            case 'error':
                console.error('[WS] Server error:', message.error);
                break;

            case 'command':
                if (this.onCommandCallback) {
                    this.onCommandCallback(message);
                }
                break;

            default:
                console.log('[WS] Unknown message type:', message.type);
        }
    }

    _startPingTimer() {
        this._stopPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this._send({ type: 'pong' });
            }
        }, this.options.pingIntervalMs);
    }

    _stopPingTimer() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    _cleanup() {
        this._stopPingTimer();
        this.authenticated = false;
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) return;

        const delay = Math.min(
            this.options.reconnectBaseMs * Math.pow(2, this.reconnectAttempts),
            this.options.reconnectMaxMs
        );

        console.log(`[WS] Reconnecting in ${delay}ms...`);
        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._connect();
        }, delay);
    }

    _send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    _flushQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this._send(message);
        }
    }

    /**
     * Send sensor readings to the server
     * @param {Array} readings - Array of {device, channel, value} objects
     */
    sendReadings(readings) {
        const message = { type: 'data', readings };

        if (this.authenticated) {
            this._send(message);
        } else {
            // Queue for later
            this.messageQueue.push(message);
        }
    }

    /**
     * Close the connection
     */
    close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this._cleanup();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export default WSClient;
