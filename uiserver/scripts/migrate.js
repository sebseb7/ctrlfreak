const Database = require('better-sqlite3');
const path = require('path');
const { config } = require('dotenv');

// Load env from root
config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../data/sensors.db');
const db = new Database(dbPath);

console.log(`[Migrate] Connected to ${dbPath}`);
console.log('[Migrate] Applying schema migrations...');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'normal')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      config TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
  `);

  // Add position column if not exists
  try {
    db.exec("ALTER TABLE views ADD COLUMN position INTEGER DEFAULT 0");
    console.log('[Migrate] Added position column to views table.');
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.log('[Migrate] NOTE: ' + e.message);
    }
  }

  console.log('[Migrate] Schema applied successfully.');
} catch (err) {
  console.error('[Migrate] Error applying schema:', err.message);
} finally {
  db.close();
}
