const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(() => {
  return mongoose.connection.db.collection('activityevents').find({
    employeeId: 'EMP_01_02'
  }).limit(1).toArray();
}).then(res => console.log(JSON.stringify(res, null, 2))).finally(() => process.exit(0));
