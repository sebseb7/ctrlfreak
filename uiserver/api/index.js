/**
 * API Routes Index - Sets up all API endpoints
 */

const setupAuthApi = require('./auth');
const setupViewsApi = require('./views');
const setupRulesApi = require('./rules');
const setupOutputsApi = require('./outputs');
const setupOutputConfigApi = require('./output-config');
const setupDevicesApi = require('./devices');
const setupReadingsApi = require('./readings');

module.exports = function setupAllApis(app, context) {
    const { db, bcrypt, jwt, JWT_SECRET, getOutputChannels, getOutputBindings, runRules, activeRuleIds } = context;

    // Auth middleware helpers
    const checkAuth = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            jwt.verify(token, JWT_SECRET, (err, user) => {
                if (user) req.user = user;
                next();
            });
        } else {
            next();
        }
    };

    const requireAdmin = (req, res, next) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    };

    // Setup all API routes
    setupAuthApi(app, { db, bcrypt, jwt, JWT_SECRET });
    setupViewsApi(app, { db, checkAuth, requireAdmin });
    setupRulesApi(app, { db, checkAuth, requireAdmin, runRules, activeRuleIds });
    setupOutputConfigApi(app, { db, checkAuth, requireAdmin });
    setupOutputsApi(app, { db, getOutputChannels, getOutputBindings });
    setupDevicesApi(app, { db, getOutputChannels });
    setupReadingsApi(app, { db });
};
