#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "ProSyncHub/Workforce-system";
const BRANCH = "main";
const WORKSPACE = path.resolve(__dirname);

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.github.com",
      path: `/repos/${REPO}${endpoint}`,
      method,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "workforce-targeted-push",
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, res => {
      let raw = "";
      res.on("data", d => raw += d);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pushFile(relPath, message) {
  const full = path.join(WORKSPACE, relPath);
  if (!fs.existsSync(full)) { console.log(`  SKIP (not found): ${relPath}`); return; }
  const content = fs.readFileSync(full, "utf8");
  const b64 = Buffer.from(content).toString("base64");

  // Get current file SHA on GitHub (needed for update)
  const existing = await api("GET", `/contents/${relPath}?ref=${BRANCH}`);
  const sha = existing.sha;

  const result = await api("PUT", `/contents/${relPath}`, {
    message,
    content: b64,
    branch: BRANCH,
    ...(sha ? { sha } : {})
  });

  if (result.content) {
    console.log(`  ✅ ${relPath}`);
  } else {
    console.log(`  ❌ ${relPath}:`, JSON.stringify(result).slice(0, 120));
  }
  await sleep(800); // avoid secondary rate limit
}

async function main() {
  const message = process.argv[2] || "Update changed files";
  const files = process.argv.slice(3);
  
  if (files.length === 0) {
    console.error("Usage: node push-changed.cjs 'commit msg' file1 file2 ...");
    process.exit(1);
  }
  
  console.log(`\nPushing ${files.length} files to ${REPO}@${BRANCH}`);
  console.log(`Commit: "${message}"\n`);

  for (const f of files) {
    await pushFile(f, message);
  }
  console.log("\nDone.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
