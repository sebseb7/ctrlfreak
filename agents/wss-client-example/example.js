import { TischlerClient } from './lib.js';

// Configuration (Replace with your actual values or set ENV vars)
// Example: SERVER_URL=ws://localhost:3000 API_KEY=k_... node example.js
const SERVER_URL = process.env.SERVER_URL || 'wss://dash.bosewolf.de/agentapi/';
const API_KEY = process.env.API_KEY || 'YOUR_API_KEY_HERE';

if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('Please set API_KEY environment variable or edit example.js');
    process.exit(1);
}

const client = new TischlerClient(SERVER_URL, API_KEY);

client.onAuthenticated = () => {
    // Determine random values for demo
    const temp = 20 + Math.random() * 5;
    const humidity = 40 + Math.random() * 20;

    // Example 1: Numeric Data (e.g. Temperature)
    // Note: The 'device' id will be prefixed by the server with your Agent's prefix.
    const readings = [
        {
            device: 'sensor-1',
            channel: 'temperature',
            value: temp
        },
        {
            device: 'sensor-1',
            channel: 'humidity',
            value: humidity
        },
        // Example 2: Generic JSON Data (e.g. Status object)
        {
            device: 'sensor-1',
            channel: 'status',
            data: { status: 'ok', battery: '95%', fw: '1.2.0' } // 'data' field for JSON
        }
    ];

    client.sendReadings(readings);

    // Close after a standardized delay to ensure ACK is received
    setTimeout(() => {
        console.log('Done. Closing connection.');
        client.close();
    }, 2000);
};

// Start
client.connect().catch(err => {
    console.error('Failed to connect:', err);
});
