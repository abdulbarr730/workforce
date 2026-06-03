const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  await mongoose.connection.db.collection('shiftpolicies').updateOne(
    { name: 'WEEKDAY_REGULAR' }, 
    { $set: { shiftEndTime: '18:30', loginCutoffTime: '09:55' } }
  );
  
  await mongoose.connection.db.collection('shiftpolicies').updateOne(
    { name: 'WEEKDAY_LATE' }, 
    { $set: { shiftEndTime: '19:00', loginCutoffTime: '09:56' } }
  );

  console.log('Reverted shift policies in DB');
  process.exit(0);
}

run();
