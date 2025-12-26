/**
 * Auth API - Login endpoint
 */

module.exports = function setupAuthApi(app, { db, bcrypt, jwt, JWT_SECRET }) {
    // POST /api/login
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        try {
            const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
            const user = stmt.get(username);

            if (!user || !bcrypt.compareSync(password, user.password_hash)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({
                id: user.id,
                username: user.username,
                role: user.role
            }, JWT_SECRET, { expiresIn: '24h' });

            res.json({ token, role: user.role, username: user.username });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
