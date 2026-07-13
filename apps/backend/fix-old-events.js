const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  const events = await mongoose.connection.db.collection('activityevents').find({ type: 'IDLE_RESPONSE' }).toArray();
  
  for (const ev of events) {
    if (ev.metadata && ev.metadata.idleMinutes) {
      // Check if we haven't already added the 5 minutes (prevent multiple runs from adding infinitely)
      // We can just assume all current ones need +5.
      if (!ev.metadata.fiveMinutesAdded) {
        const newMins = ev.metadata.idleMinutes + 5;
        const oldFrom = new Date(ev.metadata.from);
        const newFrom = new Date(oldFrom.getTime() - 5 * 60000);
        
        await mongoose.connection.db.collection('activityevents').updateOne(
          { _id: ev._id },
          { 
            $set: { 
              "metadata.idleMinutes": newMins,
              "metadata.from": newFrom.toISOString(),
              "metadata.fiveMinutesAdded": true
            } 
          }
        );
      }
    }
  }
  
  console.log(`Updated ${events.length} IDLE_RESPONSE events by adding 5 minutes.`);
  process.exit(0);
}

run();
