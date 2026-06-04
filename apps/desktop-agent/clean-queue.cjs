const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function cleanQueue() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'desktop-agent', 'offline-events.db');
  console.log("Opening DB at:", dbPath);
  
  try {
    const db = new Database(dbPath);
    const rows = db.prepare('SELECT id, payload FROM events').all();
    
    let deletedCount = 0;
    const deleteStmt = db.prepare('DELETE FROM events WHERE id = ?');
    
    for (const row of rows) {
      const payloadStr = row.payload;
      try {
        const payload = JSON.parse(payloadStr);
        if (!payload.type) {
          deleteStmt.run(row.id);
          deletedCount++;
        }
      } catch (e) {
        // If it's malformed JSON entirely, delete it
        deleteStmt.run(row.id);
        deletedCount++;
      }
    }
    
    console.log(`Successfully deleted ${deletedCount} corrupted events from the queue.`);
    
    db.close();
  } catch (error) {
    console.error("Error cleaning queue:", error.message);
  }
}

cleanQueue();
