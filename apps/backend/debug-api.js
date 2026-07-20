
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/workforce');
  const Event = mongoose.connection.collection('activityevents');
  
  // Find a recent IDLE_RESPONSE
  const idle = await Event.findOne({ type: 'IDLE_RESPONSE' }, { sort: { timestamp: -1 } });
  console.log("Recent IDLE_RESPONSE:");
  console.log(idle);
  
  if (!idle) return;
  
  // Find events for that employee
  const employeeId = idle.employeeId;
  const date = new Date(idle.timestamp).toISOString().split('T')[0];
  
  console.log(`Checking live stats for ${employeeId} on ${date}`);
  
  // Actually we can just run the logic from get-live-stats manually
  const startOfDay = new Date(`${date}T00:00:00+05:30`);
  const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
  
  const events = await Event.find({
    employeeId,
    timestamp: { $gte: startOfDay, $lte: endOfDay },
    invalidated: { $ne: true }
  }).sort({ timestamp: 1 }).toArray();
  
  let breakSeconds = 0;
  for (const ev of events) {
    if (ev.type === 'IDLE_RESPONSE') {
      console.log('Found IDLE_RESPONSE in loop:', ev);
      
      const isWorkingRaw = ev.metadata?.isWorking;
      const isWorking = isWorkingRaw === true || isWorkingRaw === 'true';
      
      let dur = 0;
      if (ev.metadata?.idleMinutes) {
        dur = ev.metadata.idleMinutes * 60;
      }
      console.log('calculated dur:', dur);
      if (dur > 0) {
        if (isWorking) {
          console.log('Adding to offline');
        } else {
          console.log('Adding to break');
          breakSeconds += dur;
        }
      }
    }
  }
  console.log('Final breakSeconds:', breakSeconds);
  process.exit(0);
}

check().catch(console.error);
