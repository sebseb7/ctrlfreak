import config from './config.js';
import ACInfinityClient from './ac-client.js';
import WSClient from './ws-client.js';

console.log('='.repeat(50));
console.log('AC Infinity Agent');
console.log('='.repeat(50));

// Validate configuration
if (!config.apiKey) {
    console.error('Error: API_KEY is required');
    process.exit(1);
}
if (!config.acEmail || !config.acPassword) {
    console.error('Error: AC_EMAIL and AC_PASSWORD are required');
    process.exit(1);
}

// Initialize clients
const acClient = new ACInfinityClient(
    config.acApiHost,
    config.acEmail,
    config.acPassword
);

const wsClient = new WSClient(config.serverUrl, config.apiKey);

// Polling function
async function pollSensors() {
    try {
        const readings = await acClient.getSensorReadings();

        if (readings.length > 0) {
            console.log(`[Poll] Sending ${readings.length} readings`);
            wsClient.sendReadings(readings);
        } else {
            console.log('[Poll] No readings available');
        }
    } catch (err) {
        console.error('[Poll] Error:', err.message);

        // Re-login if authentication failed
        if (err.message.includes('not logged in')) {
            console.log('[Poll] Attempting re-login...');
            try {
                await acClient.login();
            } catch (loginErr) {
                console.error('[Poll] Re-login failed:', loginErr.message);
            }
        }
    }
}

// Main function
async function main() {
    try {
        // Login to AC Infinity
        await acClient.login();

        // Connect to WebSocket server
        await wsClient.connect();

        // Handle commands from server
        wsClient.onCommand(async (cmd) => {
            console.log('[Main] Received command:', cmd);
            const { device, value } = cmd; // e.g. device="tent:fan"

            if (!device) return;

            try {
                // Fetch latest device list to get IDs and port mapping
                const devices = await acClient.getDevicesListAll();

                // Parse "tent:fan" -> devName="tent", portName="fan"
                // If just "tent", assume port 1 or device level
                const parts = device.split(':');
                const targetDevName = parts[0];
                const targetPortName = parts[1];

                // Find matching device by name
                const dev = devices.find(d => {
                    const name = (d.devName || `device-${d.devId}`).toLowerCase();
                    return name.includes(targetDevName.toLowerCase());
                });

                if (!dev) {
                    console.error(`[Main] Device not found: ${targetDevName}`);
                    return;
                }

                // Find port index
                // Structure varies: dev.deviceInfo.ports OR dev.devPortList
                const info = dev.deviceInfo || dev;
                const ports = info.ports || dev.devPortList || [];

                let portId = 0; // 0 usually means "All" or "Device"? But setDevicePort expects 1-4.
                // If explicit port set
                if (targetPortName) {
                    const port = ports.find(p => {
                        const pName = (p.portName || `port${p.port || p.portId}`).toLowerCase();
                        return pName.includes(targetPortName.toLowerCase());
                    });

                    if (port) {
                        portId = port.port || port.portId;
                    } else {
                        // Check if it's a number
                        const pNum = parseInt(targetPortName);
                        if (!isNaN(pNum)) portId = pNum;
                    }
                } else {
                    // Default to first port if available, or 0? 
                    // Let's assume port 1 if no specific port requested but ports exist
                    if (ports.length > 0) portId = ports[0].port || ports[0].portId;
                }

                console.log(`[Main] Setting ${dev.devName} (${dev.devId}) port ${portId} to ${value}`);
                await acClient.setDevicePort(dev.devId, portId, value);

            } catch (err) {
                console.error('[Main] Error handling command:', err);
            }
        });

        // Start polling
        console.log(`[Main] Starting polling every ${config.pollIntervalMs / 1000}s`);

        // Poll immediately
        await pollSensors();

        // Then poll at interval
        setInterval(pollSensors, config.pollIntervalMs);

    } catch (err) {
        console.error('[Main] Fatal error:', err.message);
        process.exit(1);
    }
}

// Graceful shutdown
function shutdown() {
    console.log('\n[Agent] Shutting down...');
    wsClient.close();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
main();
