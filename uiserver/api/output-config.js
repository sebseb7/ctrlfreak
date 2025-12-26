/**
 * Output Config API - CRUD for output channel configurations
 */

module.exports = function setupOutputConfigApi(app, { db, checkAuth, requireAdmin }) {
    // Apply checkAuth middleware to output config routes
    app.use('/api/output-configs', checkAuth);

    // GET /api/output-configs - List all output configs
    app.get('/api/output-configs', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');
            const stmt = db.prepare('SELECT * FROM output_configs ORDER BY position ASC');
            const rows = stmt.all();
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/output-configs - Create new output config (admin only)
    app.post('/api/output-configs', requireAdmin, (req, res) => {
        const { channel, description, value_type, min_value, max_value, device, device_channel } = req.body;

        if (!channel || !value_type) {
            return res.status(400).json({ error: 'Missing required fields: channel, value_type' });
        }

        try {
            // Get max position
            const maxPos = db.prepare('SELECT MAX(position) as max FROM output_configs').get();
            const position = (maxPos.max ?? -1) + 1;

            const stmt = db.prepare(`
                INSERT INTO output_configs (channel, description, value_type, min_value, max_value, device, device_channel, position)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const info = stmt.run(
                channel,
                description || '',
                value_type,
                min_value ?? 0,
                max_value ?? 1,
                device || null,
                device_channel || null,
                position
            );

            global.insertChangelog(req.user?.username || 'admin', `Created output config "${channel}"`);

            res.json({
                id: info.lastInsertRowid,
                channel,
                description,
                value_type,
                min_value: min_value ?? 0,
                max_value: max_value ?? 1,
                device,
                device_channel,
                position
            });
        } catch (err) {
            if (err.message.includes('UNIQUE constraint')) {
                return res.status(400).json({ error: 'Channel name already exists' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/output-configs/:id - Update output config (admin only)
    app.put('/api/output-configs/:id', requireAdmin, (req, res) => {
        const { channel, description, value_type, min_value, max_value, device, device_channel } = req.body;

        try {
            const oldConfig = db.prepare('SELECT * FROM output_configs WHERE id = ?').get(req.params.id);
            if (!oldConfig) {
                return res.status(404).json({ error: 'Output config not found' });
            }

            const stmt = db.prepare(`
                UPDATE output_configs 
                SET channel = ?, description = ?, value_type = ?, min_value = ?, max_value = ?, device = ?, device_channel = ?
                WHERE id = ?
            `);
            const info = stmt.run(
                channel ?? oldConfig.channel,
                description ?? oldConfig.description,
                value_type ?? oldConfig.value_type,
                min_value ?? oldConfig.min_value,
                max_value ?? oldConfig.max_value,
                device ?? oldConfig.device,
                device_channel ?? oldConfig.device_channel,
                req.params.id
            );

            if (info.changes > 0) {
                const changes = [];
                if (oldConfig.channel !== channel) changes.push(`channel: ${oldConfig.channel} → ${channel}`);
                if (oldConfig.device !== device) changes.push(`device: ${oldConfig.device || 'none'} → ${device || 'none'}`);
                if (oldConfig.device_channel !== device_channel) changes.push(`device_channel: ${oldConfig.device_channel || 'none'} → ${device_channel || 'none'}`);

                const changeText = changes.length > 0
                    ? `Updated output config "${channel}": ${changes.join(', ')}`
                    : `Updated output config "${channel}"`;
                global.insertChangelog(req.user?.username || 'admin', changeText);

                res.json({ success: true, id: req.params.id });
            } else {
                res.status(404).json({ error: 'Output config not found' });
            }
        } catch (err) {
            if (err.message.includes('UNIQUE constraint')) {
                return res.status(400).json({ error: 'Channel name already exists' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/output-configs/:id - Delete output config (admin only)
    app.delete('/api/output-configs/:id', requireAdmin, (req, res) => {
        try {
            const config = db.prepare('SELECT channel FROM output_configs WHERE id = ?').get(req.params.id);
            if (!config) {
                return res.status(404).json({ error: 'Output config not found' });
            }

            const stmt = db.prepare('DELETE FROM output_configs WHERE id = ?');
            const info = stmt.run(req.params.id);

            if (info.changes > 0) {
                global.insertChangelog(req.user?.username || 'admin', `Deleted output config "${config.channel}"`);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Output config not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/output-configs/reorder - Reorder output configs (admin only)
    app.post('/api/output-configs/reorder', requireAdmin, (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            return res.status(400).json({ error: 'Invalid format' });
        }

        const updateStmt = db.prepare('UPDATE output_configs SET position = ? WHERE id = ?');
        const updateMany = db.transaction((items) => {
            for (const item of items) {
                updateStmt.run(item.position, item.id);
            }
        });

        try {
            updateMany(order);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
