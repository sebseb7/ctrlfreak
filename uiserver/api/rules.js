/**
 * Rules API - CRUD for automation rules
 */

module.exports = function setupRulesApi(app, { db, checkAuth, requireAdmin, runRules, activeRuleIds, ruleStatuses }) {
    // Apply checkAuth middleware to rules routes
    app.use('/api/rules', checkAuth);

    // GET /api/rules/status - Get currently active rule IDs and detailed status
    app.get('/api/rules/status', (req, res) => {


        // Convert Map to Object for JSON serialization
        const statuses = {};
        if (ruleStatuses) {
            ruleStatuses.forEach((value, key) => {
                statuses[key] = value;
            });
        }
        res.json({
            activeIds: Array.from(activeRuleIds),
            statuses: statuses
        });
    });

    // GET /api/rules - List all rules
    app.get('/api/rules', (req, res) => {
        try {
            if (!db) throw new Error('Database not connected');
            const stmt = db.prepare('SELECT * FROM rules ORDER BY position ASC, id ASC');
            const rows = stmt.all();
            const rules = rows.map(row => ({
                ...row,
                conditions: JSON.parse(row.conditions || '{}'),
                action: JSON.parse(row.action || '{}')
            }));
            res.json(rules);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/rules - Create rule (admin only)
    app.post('/api/rules', requireAdmin, (req, res) => {
        const { name, type = 'static', enabled = 1, conditions, action } = req.body;
        if (!name || !conditions || !action) {
            return res.status(400).json({ error: 'Missing required fields: name, conditions, action' });
        }
        try {
            const stmt = db.prepare(`
                INSERT INTO rules (name, type, enabled, conditions, action, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const info = stmt.run(
                name,
                type,
                enabled ? 1 : 0,
                JSON.stringify(conditions),
                JSON.stringify(action),
                req.user?.id || null
            );
            runRules(); // Trigger rules immediately
            global.insertChangelog(req.user?.username || 'admin', `Created rule "${name}"`);
            res.json({ id: info.lastInsertRowid, name, type, enabled, conditions, action });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/rules/:id - Update rule (admin only)
    app.put('/api/rules/:id', requireAdmin, (req, res) => {
        const { name, type, enabled, conditions, action } = req.body;
        try {
            // Get old rule for comparison
            const oldRule = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
            if (!oldRule) {
                return res.status(404).json({ error: 'Rule not found' });
            }

            const stmt = db.prepare(`
                UPDATE rules SET name = ?, type = ?, enabled = ?, conditions = ?, action = ?, updated_at = datetime('now')
                WHERE id = ?
            `);
            const info = stmt.run(
                name,
                type || 'static',
                enabled ? 1 : 0,
                JSON.stringify(conditions),
                JSON.stringify(action),
                req.params.id
            );

            if (info.changes > 0) {
                runRules(); // Trigger rules immediately

                // Build detailed changelog
                const changes = [];
                if (oldRule.name !== name) {
                    changes.push(`name: "${oldRule.name}" → "${name}"`);
                }
                if (!!oldRule.enabled !== !!enabled) {
                    changes.push(`enabled: ${oldRule.enabled ? 'on' : 'off'} → ${enabled ? 'on' : 'off'}`);
                }

                // Detailed condition diff
                const oldConditions = JSON.parse(oldRule.conditions || '{}');
                const conditionDiffs = getConditionDiff(oldConditions, conditions);
                if (conditionDiffs.length > 0) {
                    changes.push(...conditionDiffs);
                }

                const oldAction = oldRule.action || '{}';
                const newAction = JSON.stringify(action);
                if (oldAction !== newAction) {
                    try {
                        const oldA = JSON.parse(oldAction);
                        const newA = action;
                        if (oldA.channel !== newA.channel) {
                            changes.push(`action channel: ${oldA.channel} → ${newA.channel}`);
                        }
                        if (JSON.stringify(oldA.value) !== JSON.stringify(newA.value)) {
                            changes.push(`action value: ${JSON.stringify(oldA.value)} → ${JSON.stringify(newA.value)}`);
                        }
                    } catch (e) {
                        changes.push('action changed');
                    }
                }

                const changeText = changes.length > 0
                    ? `Updated rule "${name}": ${changes.join(', ')}`
                    : `Updated rule "${name}" (no changes)`;
                global.insertChangelog(req.user?.username || 'admin', changeText);

                res.json({ id: req.params.id, name, type, enabled, conditions, action });
            } else {
                res.status(404).json({ error: 'Rule not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Helper to generate human readable diffs for conditions
    function getConditionDiff(oldC, newC) {
        if (!oldC && !newC) return [];
        if (!oldC || !newC) return ['conditions structure changed'];

        const fmt = (c) => {
            if (!c) return 'null';
            if (['AND', 'OR'].includes(c.operator)) return `${c.operator} Group`;
            let val = c.value;
            if (typeof val === 'object' && val?.type === 'dynamic') {
                val = `(${val.channel}*${val.factor}+${val.offset})`;
            }
            return `${c.channel || '?'} ${c.operator} ${val}`;
        };

        const isGroupOld = ['AND', 'OR'].includes(oldC.operator);
        const isGroupNew = ['AND', 'OR'].includes(newC.operator);

        // If structure type mismatch (Group vs Leaf)
        if (isGroupOld !== isGroupNew) {
            return [`${fmt(oldC)} → ${fmt(newC)}`];
        }

        if (isGroupOld) {
            if (oldC.operator !== newC.operator) {
                return [`Logic: ${oldC.operator} → ${newC.operator}`];
            }

            const oldSub = oldC.conditions || [];
            const newSub = newC.conditions || [];

            // If same size, compare specific positions (likely modifications)
            if (oldSub.length === newSub.length) {
                const diffs = [];
                for (let i = 0; i < oldSub.length; i++) {
                    diffs.push(...getConditionDiff(oldSub[i], newSub[i]));
                }
                return diffs;
            }

            // Size changed: Find added/removed
            const oldStrs = oldSub.map(c => JSON.stringify(c));
            const newStrs = newSub.map(c => JSON.stringify(c));

            const added = newSub.filter((c, i) => !oldStrs.includes(newStrs[i]));
            const removed = oldSub.filter((c, i) => !newStrs.includes(oldStrs[i]));

            const diffs = [];
            added.forEach(c => diffs.push(`Added to ${oldC.operator}: ${fmt(c)}`));
            removed.forEach(c => diffs.push(`Removed from ${oldC.operator}: ${fmt(c)}`));

            if (diffs.length === 0) {
                // Fallback (e.g. reorder or identical content duplicates)
                return [`${oldC.operator} group size: ${oldSub.length} → ${newSub.length}`];
            }
            return diffs;
        }

        // Leaf comparisons
        if (JSON.stringify(oldC) !== JSON.stringify(newC)) {
            return [`${fmt(oldC)} → ${fmt(newC)}`];
        }

        return [];
    }

    // DELETE /api/rules/:id - Delete rule (admin only)
    app.delete('/api/rules/:id', requireAdmin, (req, res) => {
        try {
            const stmt = db.prepare('DELETE FROM rules WHERE id = ?');
            const ruleName = db.prepare('SELECT name FROM rules WHERE id = ?').get(req.params.id)?.name || 'Unknown Rule';
            const info = stmt.run(req.params.id);
            if (info.changes > 0) {
                runRules(); // Trigger rules immediately
                global.insertChangelog(req.user?.username || 'admin', `Deleted rule "${ruleName}" (ID: ${req.params.id})`);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Rule not found' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/rules/reorder - Reorder rules (admin only)
    app.post('/api/rules/reorder', requireAdmin, (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid format' });

        const updateStmt = db.prepare('UPDATE rules SET position = ? WHERE id = ?');
        const updateMany = db.transaction((items) => {
            for (const item of items) {
                updateStmt.run(item.position, item.id);
            }
        });

        try {
            updateMany(order);
            runRules(); // Trigger rules immediately
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
