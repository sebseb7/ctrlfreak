const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Database = require('better-sqlite3');
const { config } = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');

// Load env vars
config();

// Database connection for Dev Server API
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'data/sensors.db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-me';
const WS_PORT = parseInt(process.env.WS_PORT || '3962', 10);
const DEV_SERVER_PORT = parseInt(process.env.DEV_SERVER_PORT || '3905', 10);
const RULE_RUNNER_INTERVAL = parseInt(process.env.RULE_RUNNER_INTERVAL || '10000', 10);
let db;

try {
    db = new Database(dbPath);
    console.log(`[UI Server] Connected to database at ${dbPath}`);

    // Create changelog table
    db.exec(`
        CREATE TABLE IF NOT EXISTS changelog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            user TEXT,
            text TEXT NOT NULL
        )
    `);

    // Create output_configs table (unified channels + bindings)
    // Note: binding_type derived from device (ac=level, tapo=switch)
    db.exec(`
        CREATE TABLE IF NOT EXISTS output_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel TEXT UNIQUE NOT NULL,
            description TEXT,
            value_type TEXT NOT NULL,
            min_value REAL DEFAULT 0,
            max_value REAL DEFAULT 1,
            device TEXT,
            device_channel TEXT,
            position INTEGER DEFAULT 0
        )
    `);

    // Helper to insert changelog entry
    global.insertChangelog = (user, text) => {
        try {
            if (!db) return;
            const stmt = db.prepare('INSERT INTO changelog (date, user, text) VALUES (?, ?, ?)');
            stmt.run(new Date().toISOString(), user || 'system', text);
            console.log(`[Changelog] ${user || 'system'}: ${text}`);
        } catch (err) {
            console.error('[Changelog] Error inserting entry:', err.message);
        }
    };

} catch (err) {
    console.error(`[UI Server] Failed to connect to database at ${dbPath}:`, err.message);
}

// Load output channels from database (replaces hardcoded OUTPUT_CHANNELS)
function getOutputChannels() {
    if (!db) return [];
    const rows = db.prepare('SELECT * FROM output_configs ORDER BY position ASC').all();
    return rows.map(r => ({
        channel: r.channel,
        type: r.value_type,
        min: r.min_value,
        max: r.max_value,
        description: r.description
    }));
}

// Load output bindings from database (replaces hardcoded OUTPUT_BINDINGS)
// Binding type derived: ac=level, tapo=switch
function getOutputBindings() {
    if (!db) return {};
    const rows = db.prepare('SELECT * FROM output_configs WHERE device IS NOT NULL').all();
    const bindings = {};
    for (const r of rows) {
        if (r.device && r.device_channel) {
            bindings[r.channel] = {
                device: r.device,
                channel: r.device_channel,
                type: r.device === 'ac' ? 'level' : 'switch'
            };
        }
    }
    return bindings;
}

// =============================================
// WebSocket Server for Agents (port 3962)
// =============================================

// Track authenticated clients by devicePrefix
const agentClients = new Map(); // devicePrefix -> Set<ws>

function validateApiKey(apiKey) {
    if (!db) return null;
    try {
        const stmt = db.prepare('SELECT id, name, device_prefix FROM api_keys WHERE key = ?');
        const result = stmt.get(apiKey);

        if (result) {
            // Update last_used_at timestamp
            db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(result.id);
        }

        return result || null;
    } catch (err) {
        console.error('[WS] Error validating API key:', err.message);
        return null;
    }
}

function insertReadingsSmart(devicePrefix, readings) {
    if (!db) throw new Error('Database not connected');

    const isoTimestamp = new Date().toISOString();

    const stmtLast = db.prepare(`
        SELECT id, value, data, data_type 
        FROM sensor_events 
        WHERE device = ? AND channel = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
    `);

    const stmtUpdate = db.prepare(`
        UPDATE sensor_events SET until = ? WHERE id = ?
    `);

    const stmtInsert = db.prepare(`
        INSERT INTO sensor_events (timestamp, until, device, channel, value, data, data_type)
        VALUES (?, NULL, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
        let inserted = 0;
        let updated = 0;

        for (const reading of items) {
            const fullDevice = `${devicePrefix}${reading.device}`;
            const channel = reading.channel;

            // Determine type and values
            let dataType = 'number';
            let value = null;
            let data = null;

            if (reading.value !== undefined && reading.value !== null) {
                dataType = 'number';
                value = reading.value;
            } else if (reading.data !== undefined) {
                dataType = 'json';
                data = typeof reading.data === 'string' ? reading.data : JSON.stringify(reading.data);
            } else {
                continue; // Skip invalid
            }

            // Check last reading for RLE
            const last = stmtLast.get(fullDevice, channel);
            let isDuplicate = false;

            if (last && last.data_type === dataType) {
                if (dataType === 'number') {
                    if (Math.abs(last.value - value) < Number.EPSILON) {
                        isDuplicate = true;
                    }
                } else {
                    // Compare JSON strings
                    if (last.data === data) {
                        isDuplicate = true;
                    }
                }
            }

            if (isDuplicate) {
                stmtUpdate.run(isoTimestamp, last.id);
                updated++;
            } else {
                stmtInsert.run(isoTimestamp, fullDevice, channel, value, data, dataType);
                inserted++;
            }
        }
        return { inserted, updated };
    });

    return transaction(readings);
}

function createAgentWebSocketServer() {
    const wss = new WebSocketServer({ port: WS_PORT });

    wss.on('connection', (ws, req) => {
        const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        console.log(`[WS] Client connected: ${clientId}`);

        const clientState = {
            authenticated: false,
            devicePrefix: null,
            name: null,
            lastPong: Date.now()
        };

        // Set up ping/pong for keepalive
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
            clientState.lastPong = Date.now();
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleAgentMessage(ws, message, clientState, clientId);
            } catch (err) {
                console.error(`[WS] Error parsing message from ${clientId}:`, err.message);
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
            }
        });

        ws.on('close', () => {
            console.log(`[WS] Client disconnected: ${clientId} (${clientState.name || 'unauthenticated'})`);
            if (clientState.devicePrefix && agentClients.has(clientState.devicePrefix)) {
                agentClients.get(clientState.devicePrefix).delete(ws);
            }
        });

        ws.on('error', (err) => {
            console.error(`[WS] Error for ${clientId}:`, err.message);
        });
    });

    // Ping interval to detect dead connections
    const pingInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                console.log('[WS] Terminating unresponsive client');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(pingInterval);
    });

    console.log(`[WS] WebSocket server listening on port ${WS_PORT}`);
    return wss;
}

function handleAgentMessage(ws, message, clientState, clientId) {
    const { type } = message;

    switch (type) {
        case 'auth':
            const { apiKey } = message;
            if (!apiKey) {
                ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Missing apiKey' }));
                return;
            }

            const keyInfo = validateApiKey(apiKey);
            if (!keyInfo) {
                ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid API key' }));
                return;
            }

            clientState.authenticated = true;
            clientState.devicePrefix = keyInfo.device_prefix;
            clientState.name = keyInfo.name;

            // Track this connection
            if (!agentClients.has(keyInfo.device_prefix)) {
                agentClients.set(keyInfo.device_prefix, new Set());
            }
            agentClients.get(keyInfo.device_prefix).add(ws);

            console.log(`[WS] Client authenticated: ${keyInfo.name} (prefix: ${keyInfo.device_prefix})`);
            ws.send(JSON.stringify({ type: 'auth', success: true, devicePrefix: keyInfo.device_prefix, name: keyInfo.name }));
            break;

        case 'pong':
            // Keepalive from agent - just update timestamp
            clientState.lastPong = Date.now();
            break;

        case 'data':
            if (!clientState.authenticated) {
                ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
                return;
            }

            const { readings } = message;
            if (!Array.isArray(readings) || readings.length === 0) {
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid readings' }));
                return;
            }

            try {
                const validReadings = readings.filter(r => r.device && r.channel && (r.value !== undefined || r.data !== undefined));
                const result = insertReadingsSmart(clientState.devicePrefix, validReadings);

                // Trigger rules immediately on new data
                if (runRules) runRules();

                ws.send(JSON.stringify({ type: 'ack', count: result.inserted + result.updated }));
            } catch (err) {
                console.error('[WS] Error inserting readings:', err.message);
                ws.send(JSON.stringify({ type: 'error', error: 'Failed to insert readings' }));
            }
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${type}` }));
    }
}

// Send command to all agents with the given device prefix
function sendCommandToDevicePrefix(devicePrefix, command) {
    const clients = agentClients.get(devicePrefix);
    if (!clients || clients.size === 0) {
        console.log(`[WS] No connected agents for prefix: ${devicePrefix}`);
        return false;
    }

    const message = JSON.stringify({ type: 'command', ...command });
    let sent = 0;

    for (const ws of clients) {
        if (ws.readyState === 1) { // OPEN
            ws.send(message);
            sent++;
        }
    }

    console.log(`[WS] Sent command to ${sent} agent(s) with prefix ${devicePrefix}:`, command);
    return sent > 0;
}

// Periodic sync: push non-zero output states to agents every 60s
function syncOutputStates() {
    if (!db) return;

    try {
        const bindings = getOutputBindings();
        // Get current output values
        const stmt = db.prepare(`
            SELECT channel, value FROM output_events 
            WHERE id IN (SELECT MAX(id) FROM output_events GROUP BY channel)
        `);
        const rows = stmt.all();

        for (const row of rows) {
            // Only sync non-zero values
            if (row.value > 0) {
                const binding = bindings[row.channel];
                if (binding) {
                    let commandValue = row.value;
                    if (binding.type === 'switch') {
                        commandValue = row.value > 0 ? 1 : 0;
                    }

                    const success = sendCommandToDevicePrefix(`${binding.device}:`, {
                        device: binding.channel,
                        action: 'set_state',
                        value: commandValue
                    });

                    if (!success) {
                        console.error(`[Sync] ERROR: Cannot deliver 'on' command for ${row.channel} -> ${binding.device}:${binding.channel} (no agent connected)`);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Sync] Error syncing output states:', err.message);
    }
}

// Start output state sync interval (every 60s)
setInterval(syncOutputStates, 60000);

// =============================================
// RULE ENGINE (Global Scope)
// =============================================

// Get current sensor value
function getSensorValue(channel) {
    // channel format: "device:channel" e.g. "ac:controller:co2"
    const lastColonIndex = channel.lastIndexOf(':');
    if (lastColonIndex === -1) return null;
    const device = channel.substring(0, lastColonIndex);
    const ch = channel.substring(lastColonIndex + 1);

    const stmt = db.prepare(`
        SELECT value FROM sensor_events 
        WHERE device = ? AND channel = ? 
        ORDER BY timestamp DESC LIMIT 1
    `);
    const row = stmt.get(device, ch);
    return row ? row.value : null;
}

// Get current output value
function getOutputValue(channel) {
    const stmt = db.prepare(`
        SELECT value FROM output_events 
        WHERE channel = ? 
        ORDER BY timestamp DESC LIMIT 1
    `);
    const row = stmt.get(channel);
    return row ? row.value : 0;
}

// Write output value with RLE
function writeOutputValue(channel, value) {
    const now = new Date().toISOString();

    const lastStmt = db.prepare(`
        SELECT id, value FROM output_events 
        WHERE channel = ? 
        ORDER BY timestamp DESC LIMIT 1
    `);
    const last = lastStmt.get(channel);

    const valueChanged = !last || Math.abs(last.value - value) >= Number.EPSILON;

    if (!valueChanged) {
        // Same value - update the until timestamp (RLE)
        const updateStmt = db.prepare('UPDATE output_events SET until = ? WHERE id = ?');
        updateStmt.run(now, last.id);
    } else {
        // New value - insert new record
        const insertStmt = db.prepare(`
            INSERT INTO output_events (timestamp, until, channel, value, data_type)
            VALUES (?, NULL, ?, ?, 'number')
        `);
        insertStmt.run(now, channel, value);
        console.log(`[RuleRunner] Output changed: ${channel} = ${value}`);

        // Send command to bound physical device
        const bindings = getOutputBindings();
        const binding = bindings[channel];
        if (binding) {
            let commandValue = value;
            if (binding.type === 'switch') {
                commandValue = value > 0 ? 1 : 0;
            }

            console.log(`[RuleRunner] Binding for ${channel}: type=${binding.type}, val=${value}, cmdVal=${commandValue}`);

            sendCommandToDevicePrefix(`${binding.device}:`, {
                device: binding.channel,
                action: 'set_state',
                value: commandValue
            });
        }
    }
}

// Compare values with operator
function compareValues(actual, operator, target) {
    if (actual === null || actual === undefined) return false;
    switch (operator) {
        case '=':
        case '==': return actual === target;
        case '!=': return actual !== target;
        case '<': return actual < target;
        case '>': return actual > target;
        case '<=': return actual <= target;
        case '>=': return actual >= target;
        default: return false;
    }
}

// Evaluate a single condition recursively and return detailed status
function evaluateConditionDetails(condition) {
    const { type, operator, value, channel } = condition;
    let result = false;
    let details = { ...condition };

    // Handle AND/OR groups
    if (operator === 'AND' || operator === 'OR') {
        const subResults = (condition.conditions || []).map(c => evaluateConditionDetails(c));
        details.conditions = subResults;

        if (operator === 'AND') {
            result = subResults.every(r => r.__result);
        } else {
            result = subResults.some(r => r.__result);
        }
        details.__result = result;
        return details;
    }

    switch (type) {
        case 'time': {
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

            if (operator === 'between' && Array.isArray(value)) {
                const [start, end] = value.map(t => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                });
                result = currentTime >= start && currentTime <= end;
            } else {
                const [h, m] = String(value).split(':').map(Number);
                const targetTime = h * 60 + m;
                result = compareValues(currentTime, operator, targetTime);
            }
            break;
        }

        case 'date': {
            const now = new Date();
            const today = now.toISOString().split('T')[0];

            if (operator === 'between' && Array.isArray(value)) {
                result = today >= value[0] && today <= value[1];
            } else if (operator === 'before') {
                result = today < value;
            } else if (operator === 'after') {
                result = today > value;
            } else {
                result = today === value;
            }
            break;
        }

        case 'sensor': {
            const sensorValue = getSensorValue(channel);
            let target = value;

            if (value && typeof value === 'object' && value.type === 'dynamic') {
                const targetSensorVal = getSensorValue(value.channel) || 0;
                target = (targetSensorVal * (value.factor || 1)) + (value.offset || 0);
            }

            result = compareValues(sensorValue, operator, target);
            // Store actual value for debugging/display if needed
            details.__actual = sensorValue;
            break;
        }

        case 'output': {
            const outputValue = getOutputValue(channel);
            result = compareValues(outputValue, operator, value);
            break;
        }

        default:
            console.warn(`[RuleRunner] Unknown condition type: ${type}`);
            result = false;
    }

    details.__result = result;
    return details;
}

// Global set to track currently active rule IDs (compat)
const activeRuleIds = new Set();
// Global map to track detailed execution status: ruleId -> conditionTree
const ruleStatuses = new Map();

// Run all rules
function runRules() {
    if (!db) return;

    try {
        const rules = db.prepare('SELECT * FROM rules WHERE enabled = 1 ORDER BY position ASC').all();

        // Clear active rules lists at start of run
        activeRuleIds.clear();
        ruleStatuses.clear();

        // Default all outputs to OFF (0) - if no rule sets them, they stay off
        const desiredOutputs = {};
        const outputChannels = getOutputChannels();
        for (const ch of outputChannels) {
            desiredOutputs[ch.channel] = 0;
        }

        for (const rule of rules) {
            try {
                const conditions = JSON.parse(rule.conditions || '{}');
                const action = JSON.parse(rule.action || '{}');

                // Evaluate with details
                const detailedConditions = evaluateConditionDetails(conditions);
                ruleStatuses.set(rule.id, detailedConditions);

                if (detailedConditions.__result) {
                    // Rule matches - add to active list
                    activeRuleIds.add(rule.id);

                    // Rule matches - set output (later rules override)
                    if (action.channel && action.value !== undefined) {
                        let finalValue = action.value;

                        // Handle calculated value
                        if (action.value && typeof action.value === 'object' && action.value.type === 'calculated') {
                            const valA = getSensorValue(action.value.sensorA) || 0;
                            const valB = action.value.sensorB ? (getSensorValue(action.value.sensorB) || 0) : 0;
                            const diff = valA - valB;
                            finalValue = (diff * (action.value.factor || 1)) + (action.value.offset || 0);
                        }

                        desiredOutputs[action.channel] = finalValue;
                    }
                }
            } catch (err) {
                console.error(`[RuleRunner] Error evaluating rule ${rule.id}:`, err.message);
            }
        }

        // Write output values
        for (const [channel, value] of Object.entries(desiredOutputs)) {
            writeOutputValue(channel, value);
        }



    } catch (err) {
        console.error('[RuleRunner] Error running rules:', err.message);
    }
}

// Also sync immediately on startup after a short delay
setTimeout(syncOutputStates, 5000);

// Start the WebSocket server
const agentWss = createAgentWebSocketServer();

// Import API setup
const setupAllApis = require('./api');

module.exports = {
    entry: './src/index.js',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'bundle.js',
        clean: true,
    },
    mode: 'development',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'],
                    },
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                // Fix for ESM modules in node_modules (MUI X Charts v8)
                test: /\.m?js$/,
                resolve: {
                    fullySpecified: false,
                },
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx'],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
        }),
    ],
    devServer: {
        port: DEV_SERVER_PORT,
        historyApiFallback: true,
        hot: true,
        allowedHosts: 'all',
        client: {
            webSocketURL: 'auto://0.0.0.0:0/ws',
            progress: true,
        },
        setupMiddlewares: (middlewares, devServer) => {
            if (!devServer) {
                throw new Error('webpack-dev-server is not defined');
            }

            // Setup body parser
            const app = devServer.app;
            const bodyParser = require('body-parser');
            app.use(bodyParser.json());

            // Setup all API routes from extracted modules
            setupAllApis(app, {
                db,
                bcrypt,
                jwt,
                JWT_SECRET,
                getOutputChannels,
                getOutputBindings,
                runRules,
                runRules,
                activeRuleIds,
                ruleStatuses,
                writeOutputValue
            });

            // Start rule runner
            const ruleRunnerInterval = setInterval(runRules, RULE_RUNNER_INTERVAL);
            console.log(`[RuleRunner] Started background job (${RULE_RUNNER_INTERVAL / 1000}s interval)`);

            // Clean up on server close
            devServer.server?.on('close', () => {
                clearInterval(ruleRunnerInterval);
                console.log('[RuleRunner] Stopped background job');
            });

            return middlewares;
        },
    },
};
