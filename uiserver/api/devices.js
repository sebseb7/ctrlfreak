/**
 * Devices API - List unique device/channel pairs
 */

module.exports = function setupDevicesApi(app, { db, getOutputChannels }) {
    // GET /api/devices - Returns list of unique device/channel pairs (sensors + outputs)
    app.get('/api/devices', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');
            // Get sensor channels
            const sensorStmt = db.prepare("SELECT DISTINCT device, channel FROM sensor_events WHERE data_type = 'number' ORDER BY device, channel");
            const sensorRows = sensorStmt.all();

            // Add output channels with 'output' as device
            const outputChannels = getOutputChannels();
            const outputRows = outputChannels.map(ch => ({
                device: 'output',
                channel: ch.channel
            }));

            res.json([...sensorRows, ...outputRows]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
