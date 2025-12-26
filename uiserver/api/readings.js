/**
 * Readings API - Sensor and output data for charts
 */

module.exports = function setupReadingsApi(app, { db }) {
    // GET /api/readings
    // Query params: since, until, selection (comma-separated device:channel pairs)
    app.get('/api/readings', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');
            const { since, until } = req.query;
            const startTime = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const endTime = until || new Date().toISOString();

            const requestedSensorChannels = []; // [{device, channel}]
            const requestedOutputChannels = [];  // [channel]

            if (req.query.selection) {
                const selections = req.query.selection.split(',');
                selections.forEach(s => {
                    const lastColonIndex = s.lastIndexOf(':');
                    if (lastColonIndex !== -1) {
                        const d = s.substring(0, lastColonIndex);
                        const c = s.substring(lastColonIndex + 1);
                        if (d === 'output') {
                            requestedOutputChannels.push(c);
                        } else {
                            requestedSensorChannels.push({ device: d, channel: c });
                        }
                    }
                });
            }

            const result = {};

            // 1. Fetch sensor data
            if (requestedSensorChannels.length > 0) {
                let sql = 'SELECT * FROM sensor_events WHERE timestamp > ? AND timestamp <= ? ';
                const params = [startTime, endTime];

                const placeholders = [];
                requestedSensorChannels.forEach(ch => {
                    placeholders.push('(device = ? AND channel = ?)');
                    params.push(ch.device, ch.channel);
                });
                if (placeholders.length > 0) {
                    sql += `AND (${placeholders.join(' OR ')}) `;
                }
                sql += 'ORDER BY timestamp ASC';

                const rows = db.prepare(sql).all(...params);

                // Backfill for sensors
                const backfillStmt = db.prepare(`
                    SELECT * FROM sensor_events 
                    WHERE device = ? AND channel = ? 
                    AND timestamp <= ? 
                    AND (until >= ? OR until IS NULL)
                    ORDER BY timestamp DESC LIMIT 1
                `);

                const backfillRows = [];
                requestedSensorChannels.forEach(ch => {
                    const prev = backfillStmt.get(ch.device, ch.channel, startTime, startTime);
                    if (prev) backfillRows.push(prev);
                });

                [...backfillRows, ...rows].forEach(row => {
                    const key = `${row.device}:${row.channel}`;
                    if (!result[key]) result[key] = [];
                    const pt = [row.timestamp, row.value];
                    if (row.until) pt.push(row.until);
                    result[key].push(pt);
                });
            }

            // 2. Fetch output data
            if (requestedOutputChannels.length > 0) {
                let sql = 'SELECT * FROM output_events WHERE timestamp > ? AND timestamp <= ? ';
                const params = [startTime, endTime];

                const placeholders = requestedOutputChannels.map(() => 'channel = ?');
                sql += `AND (${placeholders.join(' OR ')}) `;
                params.push(...requestedOutputChannels);
                sql += 'ORDER BY timestamp ASC';

                const rows = db.prepare(sql).all(...params);

                // Backfill for outputs
                const backfillStmt = db.prepare(`
                    SELECT * FROM output_events 
                    WHERE channel = ? 
                    AND timestamp <= ? 
                    AND (until >= ? OR until IS NULL)
                    ORDER BY timestamp DESC LIMIT 1
                `);

                const backfillRows = [];
                requestedOutputChannels.forEach(ch => {
                    const prev = backfillStmt.get(ch, startTime, startTime);
                    if (prev) {
                        backfillRows.push(prev);
                    } else {
                        // No data at all - add default 0 value at startTime
                        backfillRows.push({ channel: ch, timestamp: startTime, value: 0, until: null });
                    }
                });

                [...backfillRows, ...rows].forEach(row => {
                    const key = `output:${row.channel}`;
                    if (!result[key]) result[key] = [];
                    const pt = [row.timestamp, row.value];
                    if (row.until) pt.push(row.until);
                    result[key].push(pt);
                });
            }

            res.json(result);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });
};
