const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  const events = await mongoose.connection.db.collection('activityevents').find({ type: { $in: ['IDLE_RESPONSE', 'IDLE_OVERRIDE'] } }).limit(5).toArray();
  console.log(JSON.stringify(events, null, 2));
  process.exit(0);
}

run();
