const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const employeeId = "EMP001"; 

async function run() {
  await mongoose.connect('mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  const ActivityEvent = mongoose.models.ActivityEvent || mongoose.model("ActivityEvent", new mongoose.Schema({}, { strict: false }));
  
  const latestEvent = await ActivityEvent.findOne({}).sort({ timestamp: -1 });
  if (!latestEvent) {
    console.log("No events found");
    process.exit(0);
  }
  const empId = latestEvent.employeeId;
  const date = new Date().toISOString().split("T")[0];
  
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const allEvents = await ActivityEvent.find({
    timestamp: { $gte: startOfDay, $lte: endOfDay },
    invalidated: { $ne: true }
  }).lean();
  
  const empIds = [...new Set(allEvents.map(e => e.employeeId))];
  
  for (const emp of empIds) {
    const events = allEvents.filter(e => e.employeeId === emp).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    let productiveSeconds = 0;
    let unproductiveSeconds = 0;
    let neutralSeconds = 0;
    let idleSeconds = 0;
    let breakSeconds = 0;
    let offlineWorkSeconds = 0;
  
    for (const ev of events) {
      const ts = new Date(ev.timestamp);
      if (ev.type === "ACTIVE_WINDOW") {
        const durRaw = (ev.metadata)?.durationSeconds ?? 5;
        const dur = Math.max(0, Number(durRaw));
        let actualDur = dur;
        const tsStart = new Date(ts.getTime() - dur * 1000);
        if (tsStart < startOfDay) {
           actualDur = Math.max(0, (ts.getTime() - startOfDay.getTime()) / 1000);
        }
        const cat = ev.productivityCategory ?? "NEUTRAL";
        if (cat === "PRODUCTIVE") productiveSeconds += actualDur;
        else if (cat === "UNPRODUCTIVE") unproductiveSeconds += actualDur;
        else neutralSeconds += actualDur;
      }
  
      if (ev.type === "IDLE_START") {
        const rawIdle = (ev.metadata)?.idleSeconds ?? 300;
        let idleDur = Math.max(0, Number(rawIdle));
        const idleStartTime = new Date(ts.getTime() - idleDur * 1000);
        if (idleStartTime < startOfDay) {
          idleDur = Math.max(0, (ts.getTime() - startOfDay.getTime()) / 1000);
        }
        idleSeconds += idleDur;
      }
  
      if (ev.type === "IDLE_END") {
        const rawIdle = (ev.metadata)?.idleDurationSecs ?? (ev.metadata)?.idleSeconds ?? 5;
        let idleDur = Math.max(0, Number(rawIdle));
        let idleStartTime = new Date(ts.getTime() - idleDur * 1000);
        if (idleStartTime < startOfDay) {
          idleDur = Math.max(0, (ts.getTime() - startOfDay.getTime()) / 1000);
        }
        idleSeconds += idleDur;
      }
  
      if (ev.type === "IDLE_RESPONSE") {
        let dur = 0;
        if (ev.metadata?.idleMinutes) {
          dur = Math.max(0, Number(ev.metadata.idleMinutes) * 60);
        } else {
          dur = Math.max(0, idleSeconds);
        }
        let idleStartTime = new Date(ts.getTime() - dur * 1000);
        if (idleStartTime < startOfDay) {
          dur = Math.max(0, (ts.getTime() - startOfDay.getTime()) / 1000);
        }
        if (dur > 0) {
          if (ev.metadata?.isWorking === true || ev.metadata?.isWorking === "true") {
            offlineWorkSeconds += dur;
          } else {
            breakSeconds += dur;
          }
          idleSeconds = Math.max(0, idleSeconds - dur);
        }
      }
    }
  
    const totalDeduction = idleSeconds + breakSeconds + offlineWorkSeconds;
    const totalActive = productiveSeconds + unproductiveSeconds + neutralSeconds;
  
    if (totalDeduction > 0 && totalActive > 0) {
      const pRatio = productiveSeconds / totalActive;
      const uRatio = unproductiveSeconds / totalActive;
      const nRatio = neutralSeconds / totalActive;
  
      productiveSeconds -= Math.min(productiveSeconds, Math.round(totalDeduction * pRatio));
      unproductiveSeconds -= Math.min(unproductiveSeconds, Math.round(totalDeduction * uRatio));
      neutralSeconds -= Math.min(neutralSeconds, Math.round(totalDeduction * nRatio));
    }
  
    const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds + offlineWorkSeconds + idleSeconds + breakSeconds;
    
    console.log(`EMP: ${emp} | Prod: ${productiveSeconds.toFixed(1)} | Total: ${totalTrackedSeconds.toFixed(1)}`);
  }

  process.exit(0);
}

run().catch(console.error);
