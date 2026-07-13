const mongoose = require('mongoose');

async function checkEvents() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce_db?ssl=true&replicaSet=atlas-2zvxxy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=WorkforceCluster');
  
  const events = await mongoose.connection.collection('activityevents').find({}).sort({ timestamp: -1 }).limit(10).toArray();
  console.log(JSON.stringify(events, null, 2));
  
  mongoose.disconnect();
}

checkEvents();
