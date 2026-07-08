const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://workforce-dev:9Vd5ZqVd72n61K31@cluster0.zps3k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  await mongoose.connect(uri);

  try {
    const db = mongoose.connection.db; 

    const attRecords = await db.collection("attendancerecords").find({}, { projection: { date: 1, _id: 0 } }).toArray();
    console.log("Unique Attendance Dates:", [...new Set(attRecords.map(a => a.date))]);
    
    const count = await db.collection("attendancerecords").countDocuments({ date: { $gte: "2026-07-05", $lte: "2026-07-11" } });
    console.log("Count in range:", count);

  } finally {
    await mongoose.disconnect();
  }
}

run().catch(console.dir);
