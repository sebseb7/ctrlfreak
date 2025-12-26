const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { config } = require('dotenv');

// Load env from root to get DB_PATH if set
config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../data/sensors.db');

function printUsage() {
    console.log('Usage:');
    console.log('  node manage-keys.js add <name> <device_prefix>');
    console.log('  node manage-keys.js list');
    console.log('  node manage-keys.js delete <name>');
    console.log('  node manage-keys.js show <name>');
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    printUsage();
    process.exit(1);
}

const db = new Database(dbPath);

try {
    if (command === 'add') {
        const [_, name, devicePrefix] = args;
        if (!name || !devicePrefix) {
            console.error('Error: name and device_prefix are required.');
            printUsage();
            process.exit(1);
        }

        // Generate a random 32-byte hex key
        const key = crypto.randomBytes(32).toString('hex');

        try {
            const stmt = db.prepare('INSERT INTO api_keys (key, name, device_prefix) VALUES (?, ?, ?)');
            const info = stmt.run(key, name, devicePrefix);
            console.log(`API Key for '${name}' created successfully.`);
            console.log(`Key: ${key}`);
            console.log(`Device Prefix: ${devicePrefix}`);
            console.log('Keep this key safe! You can retrieve it later with "show" command if needed.');
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                console.error(`Error: Key or name conflict.`); // Unlikely for key, likely for name if we enforced unique names? 
                // Actually schema says key is unique. Name is not unique in schema but script might treat it as identifier.
                // Let's check schema again. Schema: key UNIQUE. Name is just text.
                // But we delete by name, so duplicate names would be problematic for delete cmd.
                console.error('Error:', err.message);
            } else {
                throw err;
            }
        }

    } else if (command === 'list') {
        const stmt = db.prepare('SELECT id, name, device_prefix, created_at, last_used_at, key FROM api_keys');
        const keys = stmt.all();

        // Mask keys for display
        const displayKeys = keys.map(k => ({
            ...k,
            key: k.key.substring(0, 8) + '...'
        }));

        console.table(displayKeys);

    } else if (command === 'delete') {
        const [_, name] = args;
        if (!name) {
            console.error('Error: name required');
            process.exit(1);
        }

        const deleteStmt = db.prepare('DELETE FROM api_keys WHERE name = ?');
        const info = deleteStmt.run(name);

        if (info.changes > 0) {
            console.log(`API Key(s) for '${name}' deleted.`);
        } else {
            console.log(`No API key found with name '${name}'.`);
        }

    } else if (command === 'show') {
        const [_, name] = args;
        if (!name) {
            console.error('Error: name required');
            process.exit(1);
        }

        const stmt = db.prepare('SELECT * FROM api_keys WHERE name = ?');
        const key = stmt.get(name);

        if (key) {
            console.log(`API Key Details for '${name}':`);
            console.log(`Key: ${key.key}`);
            console.log(`Device Prefix: ${key.device_prefix}`);
            console.log(`Created: ${key.created_at}`);
            console.log(`Last Used: ${key.last_used_at}`);
        } else {
            console.log(`No API key found with name '${name}'.`);
        }

    } else {
        console.error(`Unknown command: ${command}`);
        printUsage();
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    db.close();
}
