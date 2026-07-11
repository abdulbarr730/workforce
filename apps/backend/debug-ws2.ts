import mongoose from "mongoose";
import { WorkSession } from "./src/modules/work-sessions/model/work-session.model";
mongoose
  .connect(
    "mongodb+srv://prosyncinfotech:EaVjFmS2t49hJ1y3@workforce.1u915.mongodb.net/?retryWrites=true&w=majority&appName=workforce",
  )
  .then(async () => {
    const ws = await WorkSession.find({ employeeId: "EMP_01_02" })
      .sort({ loginAt: -1 })
      .limit(2);
    console.log(JSON.stringify(ws, null, 2));
    mongoose.disconnect();
  });
