const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/sensors.db');
const db = new Database(dbPath, { readonly: true });

console.log('--- RULES ---');
const rules = db.prepare('SELECT * FROM rules').all();
console.log(JSON.stringify(rules, null, 2));

console.log('\n--- OUTPUT CHANNELS ---');
const outputs = db.prepare("SELECT * FROM output_events WHERE channel = 'CircFanLevel' ORDER BY timestamp DESC LIMIT 10").all();
console.table(outputs);

console.log('\n--- SENSOR DATA (ac:tent:temperature) ---');
const sensors = db.prepare("SELECT * FROM sensor_events WHERE device = 'ac' AND channel = 'tent:temperature' ORDER BY timestamp DESC LIMIT 5").all();
console.table(sensors);
