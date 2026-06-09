import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config({ path: "apps/backend/.env" });

const schema = new mongoose.Schema({}, { strict: false });
const ShiftPolicy = mongoose.model("ShiftPolicy", schema, "shiftpolicies");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const policies = await ShiftPolicy.find({});
  console.log(JSON.stringify(policies, null, 2));
  process.exit(0);
}
run();
