import mongoose from "mongoose";
import dotenv from "dotenv";
import { getTeamIntelligence } from "./src/modules/analytics/services/get-team-intelligence.service";

dotenv.config();

async function run() {
  await mongoose.connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://workforce-dev:9Vd5ZqVd72n61K31@cluster0.zps3k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
  );
  console.log("Connected to MongoDB");

  try {
    const result = await getTeamIntelligence("2026-07-01", "2026-07-31");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

run();
