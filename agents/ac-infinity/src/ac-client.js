/**
 * AC Infinity API Client
 * Ported from TypeScript homebridge-acinfinity plugin
 */

const API_URL_LOGIN = '/api/user/appUserLogin';
const API_URL_GET_DEVICE_INFO_LIST_ALL = '/api/user/devInfoListAll';

export class ACInfinityClientError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ACInfinityClientError';
    }
}

export class ACInfinityClientCannotConnect extends ACInfinityClientError {
    constructor() {
        super('Cannot connect to AC Infinity API');
    }
}

export class ACInfinityClientInvalidAuth extends ACInfinityClientError {
    constructor() {
        super('Invalid authentication credentials');
    }
}

export class ACInfinityClient {
    constructor(host, email, password) {
        this.host = host;
        this.email = email;
        this.password = password;
        this.userId = null;
    }

    async login() {
        try {
            // AC Infinity API does not accept passwords greater than 25 characters - UPDATE: Reference impl uses full password?
            // const normalizedPassword = this.password.substring(0, 25);
            const normalizedPassword = this.password;

            const response = await fetch(`${this.host}${API_URL_LOGIN}`, {
                method: 'POST',
                headers: {
                    'User-Agent': 'ACController/1.9.7 (com.acinfinity.humiture; build:533; iOS 18.5.0) Alamofire/5.10.2',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    appEmail: this.email,
                    appPasswordl: normalizedPassword, // Note: intentional typo in API
                }),
            });

            const data = await response.json();

            if (data.code !== 200) {
                if (data.code === 10001) {
                    throw new ACInfinityClientInvalidAuth();
                }
                throw new ACInfinityClientError(`Login failed: ${JSON.stringify(data)}`);
            }

            this.userId = data.data.appId;
            console.log('[AC] Successfully logged in to AC Infinity API');
            return this.userId;
        } catch (error) {
            console.error('[AC] Login error details:', error); // Added detailed logging
            if (error instanceof ACInfinityClientError) {
                throw error;
            }
            throw new ACInfinityClientCannotConnect();
        }
    }

    isLoggedIn() {
        return this.userId !== null;
    }

    getAuthHeaders() {
        if (!this.userId) {
            throw new ACInfinityClientError('Client is not logged in');
        }
        return {
            token: this.userId,
            phoneType: '1',
            appVersion: '1.9.7',
        };
    }

    async getDevicesListAll() {
        if (!this.isLoggedIn()) {
            throw new ACInfinityClientError('AC Infinity client is not logged in');
        }

        try {
            const response = await fetch(`${this.host}${API_URL_GET_DEVICE_INFO_LIST_ALL}`, {
                method: 'POST',
                headers: {
                    'User-Agent': 'ACController/1.9.7 (com.acinfinity.humiture; build:533; iOS 18.5.0) Alamofire/5.10.2',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                    ...this.getAuthHeaders(),
                },
                body: new URLSearchParams({
                    userId: this.userId,
                }),
            });

            const data = await response.json();

            if (data.code !== 200) {
                throw new ACInfinityClientError(`Request failed: ${JSON.stringify(data)}`);
            }

            return data.data || [];
        } catch (error) {
            if (error instanceof ACInfinityClientError) {
                throw error;
            }
            throw new ACInfinityClientCannotConnect();
        }
    }

    /**
     * Extract sensor readings from device list
     * @returns {Array} Array of {device, channel, value} objects
     */
    async getSensorReadings() {
        const devices = await this.getDevicesListAll();
        const readings = [];

        for (const device of devices) {
            const devId = device.devId;
            const devName = device.devName || `device-${devId}`;
            // Use deviceInfo if available (newer API structure), otherwise fallback to root/devSettings
            const info = device.deviceInfo || device;
            const settings = device.devSettings || info;

            // Normalize device name for use as identifier
            const deviceId = devName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

            // --- Device Level Sensors ---

            // Temperature (Celsius * 100)
            if (info.temperature !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'temperature',
                    value: info.temperature / 100,
                });
            } else if (settings.temperature !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'temperature',
                    value: settings.temperature / 100,
                });
            }

            // Humidity (% * 100)
            if (info.humidity !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'humidity',
                    value: info.humidity / 100,
                });
            } else if (settings.humidity !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'humidity',
                    value: settings.humidity / 100,
                });
            }

            // VPD
            if (info.vpdnums !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'vpd',
                    value: info.vpdnums / 100,
                });
            } else if (settings.vpdnums !== undefined) {
                readings.push({
                    device: deviceId,
                    channel: 'vpd',
                    value: settings.vpdnums / 100,
                });
            }

            // --- Port Level Sensors/State ---
            const ports = info.ports || device.devPortList;
            if (ports && Array.isArray(ports)) {
                for (const port of ports) {
                    const portId = port.port || port.portId;
                    const portName = port.portName || `port${portId}`;
                    // Create a descriptive suffix for the port device, e.g. "wall-fan" or "wall-port1"
                    // If portName is generic "Port X", use number. If it's specific "Fan", use that.
                    const suffix = portName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    const portDeviceId = `${deviceId}-${suffix}`;

                    // Port specific sensors (if any - sometimes temp usually on device)
                    if (port.temperature !== undefined) {
                        readings.push({
                            device: portDeviceId,
                            channel: 'temperature',
                            value: port.temperature / 100,
                        });
                    }
                    if (port.humidity !== undefined) {
                        readings.push({
                            device: portDeviceId,
                            channel: 'humidity',
                            value: port.humidity / 100,
                        });
                    }

                    // Level / Speed (speak)
                    if (port.speak !== undefined) {
                        readings.push({
                            device: portDeviceId,
                            channel: 'level',
                            value: port.speak,
                        });
                    }
                }
            }
        }

        return readings;
    }

    async getDeviceModeSettings(devId, port) {
        if (!this.isLoggedIn()) {
            await this.login();
        }

        try {
            const response = await fetch(`${this.host}/api/dev/getdevModeSettingList`, {
                method: 'POST',
                headers: {
                    'User-Agent': 'ACController/1.9.7 (com.acinfinity.humiture; build:533; iOS 18.5.0) Alamofire/5.10.2',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                    ...this.getAuthHeaders(),
                },
                body: new URLSearchParams({
                    devId: devId,
                    port: port.toString()
                })
            });
            const data = await response.json();
            return data.data;
        } catch (err) {
            console.error('[AC] Error getting device settings:', err);
            throw err;
        }
    }

    /**
     * Set device port mode/level
     * @param {string} devId - Device ID
     * @param {number} port - Port number (1-4)
     * @param {number} level - Level 0-10
     */
    async setDevicePort(devId, port, level) {
        if (!this.isLoggedIn()) {
            await this.login();
        }

        try {
            // 1. Get existing settings
            const settings = await this.getDeviceModeSettings(devId, port);
            if (!settings) throw new Error('Could not fetch existing settings');

            // 2. Prepare updates
            // Constrain level 0-10
            const safeLevel = Math.max(0, Math.min(10, Math.round(level)));

            // AtType Constants from reverse engineering
            const AtType = {
                OFF: 1,
                ON: 2,
                AUTO: 3
            };

            // Mode 2 = ON (Manual), 1 = OFF
            const mode = safeLevel === 0 ? AtType.OFF : AtType.ON;

            // Merge with existing settings
            // We need to send back mostly specific keys. 
            // Based on reference usage, we can try merging into a new object using existing keys
            // but 'mode' and 'speak' are overrides.

            const params = new URLSearchParams();

            // Add required base params
            params.append('userId', this.userId);
            params.append('devId', devId);
            params.append('port', port.toString());

            // Add mode/speak
            params.append('mode', mode.toString());

            // NOTE: In Mode 1 (OFF), 'speak' sets the Minimum Speed (usually 0).
            //       In Mode 2 (ON), 'speak' sets the Maximum/Target Speed.
            const speakValue = mode === AtType.OFF ? 0 : safeLevel;
            params.append('speak', speakValue.toString());

            // CRITICAL FIX: Explicitly set atType to match the mode!
            // atType: 1 = OFF, 2 = ON, 3 = AUTO
            params.append('atType', mode.toString());

            // Ensure onSpead (Max Speed) matches target if in ON mode
            if (mode === AtType.ON) {
                params.append('onSpead', safeLevel.toString());
            } else {
                // In OFF mode, ensure onSpead is at least present (maybe 10 or 0? Leaving existing or default)
                if (!params.has('onSpead')) params.append('onSpead', '10');
            }

            // Copy other relevant fields from settings if they exist to maintain state
            // Common fields seen in other implementations: 
            // transitionType, surplus, backup, trigger related fields...
            // For addDevMode, usually just the basics + what we want to change is enough IF the server merges?
            // But the error 999999 suggests missing fields.
            // Let's copy everything from settings that looks like a config parameter

            const keyBlocklist = ['devId', 'port', 'mode', 'speak', 'devName', 'deviceInfo', 'devType', 'macAddr'];

            for (const [key, val] of Object.entries(settings)) {
                if (!keyBlocklist.includes(key) && typeof val !== 'object') {
                    params.append(key, val);
                }
            }

            // Ensure defaults if missing
            if (!params.has('surplus')) params.append('surplus', '0');
            if (!params.has('backup')) params.append('backup', '0');
            if (!params.has('transitionType')) params.append('transitionType', '0');

            // 3. Send update
            const response = await fetch(`${this.host}/api/dev/addDevMode?${params.toString()}`, {
                method: 'POST',
                headers: {
                    'User-Agent': 'ACController/1.9.7 (com.acinfinity.humiture; build:533; iOS 18.5.0) Alamofire/5.10.2',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                    ...this.getAuthHeaders(),
                },
            });

            const data = await response.json();

            if (data.code !== 200) {
                throw new ACInfinityClientError(`Set mode failed: ${JSON.stringify(data)}`);
            }

            console.log(`[AC] Set device ${devId} port ${port} to level ${safeLevel} (mode ${mode}: ${mode === 1 ? 'OFF' : 'ON'})`);
            return true;
        } catch (error) {
            console.error('[AC] Error setting device port:', error);
            return false;
        }
    }
}

export default ACInfinityClient;
