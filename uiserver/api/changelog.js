/**
 * Changelog API - Read-only access to system changelog
 */

module.exports = function setupChangelogApi(app, { db, checkAuth }) {
    // Apply checkAuth middleware
    app.use('/api/changelog', checkAuth);

    // GET /api/changelog - Get recent changelog entries
    app.get('/api/changelog', (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            if (!db) throw new Error('Database not connected');

            // Limit to last 100 entries to prevent overload
            const stmt = db.prepare('SELECT * FROM changelog ORDER BY id DESC LIMIT 100');
            const rows = stmt.all();
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
