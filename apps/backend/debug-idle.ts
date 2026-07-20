import mongoose from "mongoose";
import { ActivityEvent } from "./src/modules/tracking/model/activity-event.model";
import { config } from "dotenv";
config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/workforce");
  const employeeId = "EMP-7592"; // Example, we will just fetch any IDLE_RESPONSE event
  const events = await ActivityEvent.find({ type: "IDLE_RESPONSE" }).sort({ timestamp: -1 }).limit(10).lean();
  
  for (const ev of events) {
    console.log("Found IDLE_RESPONSE:");
    console.log(JSON.stringify(ev.metadata, null, 2));
    
    const isWorkingRaw = (ev.metadata as any)?.isWorking;
    const isWorking = isWorkingRaw === true || isWorkingRaw === "true";
    
    let dur = 0;
    if ((ev.metadata as any)?.idleMinutes) {
      dur = (ev.metadata as any).idleMinutes * 60;
    }
    
    console.log(`isWorking: ${isWorking}, idleMinutes raw: ${(ev.metadata as any)?.idleMinutes}, calculated dur: ${dur}`);
  }
  process.exit(0);
}
run().catch(console.error);
