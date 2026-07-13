#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "ProSyncHub/Workforce-system";
const BRANCH = "main";
const WORKSPACE = path.resolve(__dirname);

const EXCLUDE = [
  "node_modules", ".git", ".local", "scripts", "attached_assets",
  ".next", "dist", ".turbo", "out", "coverage", "build",
  "push-to-github.cjs", "replit.md", ".replit", "tsconfig.base.json",
  "pnpm-lock.yaml"
];

function shouldExclude(rel) {
  const top = rel.split("/")[0];
  if (EXCLUDE.includes(top)) return true;
  if (EXCLUDE.includes(path.basename(rel))) return true;
  // exclude workspace-level node_modules inside any package
  if (rel.includes("/node_modules/")) return true;
  // exclude .next build inside apps
  if (rel.includes("/.next/")) return true;
  // exclude dist inside packages
  if (/^(packages|apps)\/[^/]+\/dist\//.test(rel)) return true;
  return false;
}

function getAllFiles(dir, base) {
  base = base || dir;
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (shouldExclude(rel)) continue;
    if (entry.isDirectory()) files = files.concat(getAllFiles(full, base));
    else files.push({ full, rel });
  }
  return files;
}

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.github.com",
      path: `/repos/${REPO}${endpoint}`,
      method,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "workforce-push-script/2.0",
        "Content-Type": "application/json",
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

async function createBlobParallel(files, concurrency) {
  const results = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const blobs = await Promise.all(batch.map(async ({ full, rel }) => {
      const content = fs.readFileSync(full);
      const isBinary = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|eot|pdf|zip|exe|dmg)$/i.test(rel);
      const blob = await apiRequest("POST", "/git/blobs", {
        content: isBinary ? content.toString("base64") : content.toString("utf8"),
        encoding: isBinary ? "base64" : "utf-8"
      });
      if (!blob.sha) throw new Error(`Blob failed for ${rel}: ${JSON.stringify(blob)}`);
      return { path: rel, mode: "100644", type: "blob", sha: blob.sha };
    }));
    results.push(...blobs);
    const done = Math.min(i + concurrency, files.length);
    process.stdout.write(`  blobs: ${done}/${files.length}\r`);
  }
  return results;
}

async function main() {
  const message = process.argv[2] || "Update from Replit workspace";
  console.log(`\nPushing to ${REPO}@${BRANCH}`);
  console.log(`Commit: "${message}"\n`);

  const ref = await apiRequest("GET", `/git/refs/heads/${BRANCH}`);
  const headSha = ref.object && ref.object.sha;
  if (!headSha) { console.error("HEAD SHA failed:", JSON.stringify(ref)); process.exit(1); }
  console.log(`Current HEAD: ${headSha.slice(0, 7)}`);

  const commit = await apiRequest("GET", `/git/commits/${headSha}`);
  const baseTreeSha = commit.tree && commit.tree.sha;

  const files = getAllFiles(WORKSPACE);
  console.log(`Files to push: ${files.length}`);

  const treeItems = await createBlobParallel(files, 20);
  console.log(`\n  ${treeItems.length} blobs done`);

  const tree = await apiRequest("POST", "/git/trees", { base_tree: baseTreeSha, tree: treeItems });
  if (!tree.sha) { console.error("Tree failed:", JSON.stringify(tree)); process.exit(1); }
  console.log(`Tree: ${tree.sha.slice(0, 7)}`);

  const newCommit = await apiRequest("POST", "/git/commits", {
    message, tree: tree.sha, parents: [headSha]
  });
  if (!newCommit.sha) { console.error("Commit failed:", JSON.stringify(newCommit)); process.exit(1); }
  console.log(`Commit: ${newCommit.sha.slice(0, 7)}`);

  const update = await apiRequest("PATCH", `/git/refs/heads/${BRANCH}`, {
    sha: newCommit.sha, force: false
  });
  if (update.object && update.object.sha) {
    console.log(`\n✓ Pushed to ${REPO}@${BRANCH}`);
    console.log(`  SHA: ${update.object.sha.slice(0, 7)} — ${message}`);
  } else {
    console.error("\n✗ Push failed:", JSON.stringify(update));
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
