/**
 * Views API - CRUD for dashboard views
 */

module.exports = function setupViewsApi(app, { db, checkAuth, requireAdmin }) {
    // Apply checkAuth middleware to views routes
    app.use('/api/views', checkAuth);

    // POST /api/views - Create view (admin only)
    app.post('/api/views', requireAdmin, (req, res) => {
        const { name, config } = req.body;
        try {
            const stmt = db.prepare('INSERT INTO views (name, config, created_by) VALUES (?, ?, ?)');
            const info = stmt.run(name, JSON.stringify(config), req.user.id);
            global.insertChangelog(req.user.username, `Created view "${name}"`);
            res.json({ id: info.lastInsertRowid, name, config });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/views - List all views (public)
    app.get('/api/views', (req, res) => {
        try {
            const stmt = db.prepare('SELECT * FROM views ORDER BY position ASC, id ASC');
            const rows = stmt.all();
            const views = rows.map(row => {
                try {
                    return { ...row, config: JSON.parse(row.config) };
                } catch (e) {
                    return row;
                }
            });
            res.json(views);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/views/:id - Get single view
    app.get('/api/views/:id', (req, res) => {
        try {
            const stmt = db.prepare('SELECT * FROM views WHERE id = ?');
            const view = stmt.get(req.params.id);
            if (view) {
                view.config = JSON.parse(view.config);
                res.json(view);
            } else {
                res.status(404).json({ error: 'View not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/views/:id - Delete view (admin only)
    app.delete('/api/views/:id', requireAdmin, (req, res) => {
        try {
            const stmt = db.prepare('DELETE FROM views WHERE id = ?');
            const viewName = db.prepare('SELECT name FROM views WHERE id = ?').get(req.params.id)?.name || 'Unknown View';
            const info = stmt.run(req.params.id);
            if (info.changes > 0) {
                global.insertChangelog(req.user.username, `Deleted view "${viewName}" (ID: ${req.params.id})`);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'View not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/views/:id - Update view (admin only)
    app.put('/api/views/:id', requireAdmin, (req, res) => {
        const { name, config } = req.body;
        try {
            // Get old view for comparison
            const oldView = db.prepare('SELECT * FROM views WHERE id = ?').get(req.params.id);
            if (!oldView) {
                return res.status(404).json({ error: 'View not found' });
            }

            const stmt = db.prepare('UPDATE views SET name = ?, config = ? WHERE id = ?');
            const info = stmt.run(name, JSON.stringify(config), req.params.id);
            if (info.changes > 0) {
                // Build detailed changelog
                const changes = [];

                // Check name change
                if (oldView.name !== name) {
                    changes.push(`renamed: "${oldView.name}" → "${name}"`);
                }

                // Parse configs for comparison
                let oldConfig = {};
                try { oldConfig = JSON.parse(oldView.config || '{}'); } catch (e) { }
                const newConfig = config || {};

                // Compare channels
                const oldChannels = (oldConfig.channels || []).map(ch =>
                    typeof ch === 'string' ? ch : ch.channel
                );
                const newChannels = (newConfig.channels || []).map(ch =>
                    typeof ch === 'string' ? ch : ch.channel
                );

                const added = newChannels.filter(ch => !oldChannels.includes(ch));
                const removed = oldChannels.filter(ch => !newChannels.includes(ch));

                if (added.length > 0) {
                    changes.push(`added channels: ${added.join(', ')}`);
                }
                if (removed.length > 0) {
                    changes.push(`removed channels: ${removed.join(', ')}`);
                }

                // Check for color/fill changes
                const oldChannelConfigs = {};
                (oldConfig.channels || []).forEach(ch => {
                    if (typeof ch === 'object') {
                        oldChannelConfigs[ch.channel] = ch;
                    }
                });
                const newChannelConfigs = {};
                (newConfig.channels || []).forEach(ch => {
                    if (typeof ch === 'object') {
                        newChannelConfigs[ch.channel] = ch;
                    }
                });

                const colorChanges = [];
                for (const ch of newChannels) {
                    const oldCh = oldChannelConfigs[ch] || {};
                    const newCh = newChannelConfigs[ch] || {};
                    if (oldCh.color !== newCh.color || oldCh.fillColor !== newCh.fillColor) {
                        colorChanges.push(ch.split(':').pop());
                    }
                }
                if (colorChanges.length > 0) {
                    changes.push(`colors changed for: ${colorChanges.join(', ')}`);
                }

                // Check order change
                if (added.length === 0 && removed.length === 0 &&
                    JSON.stringify(oldChannels) !== JSON.stringify(newChannels)) {
                    changes.push('channel order changed');
                }

                const changeText = changes.length > 0
                    ? `Updated view "${name}": ${changes.join('; ')}`
                    : `Updated view "${name}" (no significant changes)`;
                global.insertChangelog(req.user.username, changeText);

                res.json({ id: req.params.id, name, config });
            } else {
                res.status(404).json({ error: 'View not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/views/reorder - Reorder views (admin only)
    app.post('/api/views/reorder', requireAdmin, (req, res) => {
        const { order } = req.body;
        console.log('[API] Reorder request:', order);
        if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid format' });

        const updateStmt = db.prepare('UPDATE views SET position = ? WHERE id = ?');
        const updateMany = db.transaction((items) => {
            for (const item of items) {
                console.log('[API] Updating view', item.id, 'to position', item.position);
                updateStmt.run(item.position, item.id);
            }
        });

        try {
            updateMany(order);
            console.log('[API] Reorder successful');
            res.json({ success: true });
        } catch (err) {
            console.error('[API] Reorder error:', err);
            res.status(500).json({ error: err.message });
        }
    });
};
