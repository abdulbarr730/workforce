const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  const depts = await mongoose.connection.db.collection('departments').find({}).toArray();
  
  let updatedCount = 0;
  for (const dept of depts) {
    const res = await mongoose.connection.db.collection('users').updateMany(
      { departmentId: dept._id.toString() },
      { $set: { departmentName: dept.name } }
    );
    updatedCount += res.modifiedCount;
  }
  
  console.log(`Successfully synced ${updatedCount} users with their correct department names.`);
  process.exit(0);
}

run();
