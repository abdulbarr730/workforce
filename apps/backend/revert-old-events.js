const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  const events = await mongoose.connection.db.collection('activityevents').find({ "metadata.fiveMinutesAdded": true }).toArray();
  
  for (const ev of events) {
    if (ev.metadata && ev.metadata.idleMinutes) {
      const newMins = ev.metadata.idleMinutes - 5;
      const oldFrom = new Date(ev.metadata.from);
      const newFrom = new Date(oldFrom.getTime() + 5 * 60000); // Shift forward by 5 minutes
      
      await mongoose.connection.db.collection('activityevents').updateOne(
        { _id: ev._id },
        { 
          $set: { 
            "metadata.idleMinutes": newMins,
            "metadata.from": newFrom.toISOString()
          },
          $unset: {
            "metadata.fiveMinutesAdded": ""
          }
        }
      );
    }
  }
  
  console.log(`Reverted ${events.length} IDLE_RESPONSE events by subtracting 5 minutes.`);
  process.exit(0);
}

run();
