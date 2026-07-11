import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/modules/users/model/user.model";
import { AttendanceRecord } from "./src/modules/attendance/model/attendance-record.model";
import { EmployeeDailyAnalytics } from "./src/modules/analytics/model/employee-daily-analytics.model";

dotenv.config();

async function run() {
  await mongoose.connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://workforce-dev:9Vd5ZqVd72n61K31@cluster0.zps3k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
  );

  try {
    const admin = await User.findOne({ email: "admin@workforce.com" }).lean();
    console.log("Admin role:", admin?.role);

    const roles = await User.distinct("role");
    console.log("All roles in DB:", roles);

    const attCount = await AttendanceRecord.countDocuments({
      date: { $gte: "2026-07-05", $lte: "2026-07-11" },
    });
    console.log("Attendance count for July 5-11:", attCount);

    const allAtt = await AttendanceRecord.find({}, "date").limit(10).lean();
    console.log(
      "Sample Attendance Dates:",
      allAtt.map((a) => a.date),
    );
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
}

run();
