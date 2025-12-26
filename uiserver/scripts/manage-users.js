const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { config } = require('dotenv');

// Load env from root to get DB_PATH if set
config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../data/sensors.db');

function printUsage() {
    console.log('Usage:');
    console.log('  node manage-users.js add <username> <password> <role>');
    console.log('  node manage-users.js list');
    console.log('  node manage-users.js delete <username>');
    console.log('\nRoles: admin, normal');
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
        const [_, username, password, role] = args;
        if (!username || !password || !role) {
            console.error('Error: username, password, and role are required.');
            printUsage();
            process.exit(1);
        }

        if (!['admin', 'normal'].includes(role)) {
            console.error('Error: role must be either "admin" or "normal"');
            process.exit(1);
        }

        const hash = bcrypt.hashSync(password, 10);

        try {
            const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
            const info = stmt.run(username, hash, role);
            console.log(`User '${username}' created successfully (ID: ${info.lastInsertRowid}).`);
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                console.error(`Error: User '${username}' already exists.`);
            } else {
                throw err;
            }
        }

    } else if (command === 'list') {
        const stmt = db.prepare('SELECT id, username, role, created_at FROM users');
        const users = stmt.all();
        console.table(users);

    } else if (command === 'delete') {
        const [_, username] = args;
        if (!username) {
            console.error('Error: username required');
            process.exit(1);
        }

        // Find user first to get ID
        const userStmt = db.prepare('SELECT id FROM users WHERE username = ?');
        const user = userStmt.get(username);

        if (user) {
            // Orphan views created by this user (set created_by to NULL)
            const viewUnlinkStmt = db.prepare('UPDATE views SET created_by = NULL WHERE created_by = ?');
            const viewInfo = viewUnlinkStmt.run(user.id);
            if (viewInfo.changes > 0) {
                console.log(`Unlinked ${viewInfo.changes} views from user '${username}'.`);
            }

            // Delete user
            const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
            deleteStmt.run(user.id);
            console.log(`User '${username}' deleted.`);
        } else {
            console.log(`User '${username}' not found.`);
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
