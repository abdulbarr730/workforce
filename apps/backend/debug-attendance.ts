// @ts-nocheck
import mongoose from "mongoose";
import { generateDailyAttendance } from "./src/modules/attendance/services/generate-daily-attendance.service";

mongoose
  .connect(
    "mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority",
  )
  .then(async () => {
    const res = await generateDailyAttendance({
      date: new Date().toISOString().split("T")[0],
    });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  });
