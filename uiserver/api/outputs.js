/**
 * Outputs API - Output channel definitions and values
 */

module.exports = function setupOutputsApi(app, { db, getOutputChannels, getOutputBindings, writeOutputValue, checkAuth, requireAdmin }) {
    // POST /api/outputs/:channel - Set output value (Admin only)
    app.post('/api/outputs/:channel', checkAuth, requireAdmin, (req, res) => {
        try {
            const { channel } = req.params;
            const { value } = req.body;

            if (value === undefined) {
                return res.status(400).json({ error: 'Missing value' });
            }

            console.log(`[API] Manually setting output ${channel} to ${value}`);
            writeOutputValue(channel, parseFloat(value));

            res.json({ success: true, channel, value });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET /api/outputs - List output channel definitions
    app.get('/api/outputs', (req, res) => {
        res.json(getOutputChannels());
    });

    // GET /api/outputs/values - Get current output values
    app.get('/api/outputs/values', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');
            const result = {};
            const stmt = db.prepare(`
                SELECT channel, value FROM output_events 
                WHERE id IN (
                    SELECT MAX(id) FROM output_events GROUP BY channel
                )
            `);
            const rows = stmt.all();
            rows.forEach(row => {
                result[row.channel] = row.value;
            });
            // Fill in defaults for missing channels
            const outputChannels = getOutputChannels();
            outputChannels.forEach(ch => {
                if (result[ch.channel] === undefined) {
                    result[ch.channel] = 0;
                }
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/outputs/commands - Get desired states for bound devices
    // Agents poll this to get commands. Returns { "device:channel": { state: 0|1 } }
    app.get('/api/outputs/commands', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');

            // Get current output values
            const stmt = db.prepare(`
                SELECT channel, value FROM output_events 
                WHERE id IN (
                    SELECT MAX(id) FROM output_events GROUP BY channel
                )
            `);
            const rows = stmt.all();
            const outputValues = {};
            rows.forEach(row => {
                outputValues[row.channel] = row.value;
            });

            // Map to device commands
            const bindings = getOutputBindings();
            const commands = {};
            for (const [outputChannel, binding] of Object.entries(bindings)) {
                const value = outputValues[outputChannel] ?? 0;
                const deviceKey = `${binding.device}:${binding.channel}`;
                commands[deviceKey] = {
                    state: value > 0 ? 1 : 0,
                    source: outputChannel
                };
            }

            res.json(commands);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
