import mongoose from "mongoose";
import { WorkSession } from "./src/modules/work-sessions/model/work-session.model";
async function test() {
  await mongoose.connect(
    "mongodb+srv://prosyncinfotech:EaVjFmS2t49hJ1y3@workforce.1u915.mongodb.net/?retryWrites=true&w=majority&appName=workforce",
  );
  const session = await WorkSession.findOne({ employeeId: "EMP_01_02" })
    .sort({ loginAt: -1 })
    .lean();
  console.log("Session loginAt:", session?.loginAt);
  process.exit(0);
}
test();
