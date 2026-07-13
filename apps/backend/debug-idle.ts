import mongoose from "mongoose";
import { ActivityEvent } from "./src/modules/tracking/model/activity-event.model";
mongoose
  .connect(
    "mongodb+srv://prosyncinfotech:EaVjFmS2t49hJ1y3@workforce.1u915.mongodb.net/?retryWrites=true&w=majority&appName=workforce",
  )
  .then(async () => {
    const evs = await ActivityEvent.find({
      employeeId: "EMP_01_02",
      type: "IDLE_RESPONSE",
    })
      .sort({ timestamp: -1 })
      .limit(5);
    console.log(JSON.stringify(evs, null, 2));
    mongoose.disconnect();
  });
