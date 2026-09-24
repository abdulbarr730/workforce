# VPS performance runbook

The production VPS (1–2 vCPU, 2–4 GB RAM) runs MongoDB, the API and both Next.js
dashboards together. These steps keep it from hitting 100% CPU/RAM. None of
them delete data: every telemetry record is kept.

## 0. Confirm the diagnosis (optional, read-only)

```bash
free -m
pm2 status
pm2 describe admin-dashboard   # must show "next start", never "next dev"
mongosh "$MONGO_URI" --eval 'db.activityevents.stats().count; db.activityevents.getIndexes()'
```

To see the slowest queries:

```bash
mongosh "$MONGO_URI" --eval 'db.setProfilingLevel(1, { slowms: 200 })'
# ...use the app for a few minutes...
mongosh "$MONGO_URI" --eval 'db.system.profile.find().sort({ millis: -1 }).limit(10).pretty()'
mongosh "$MONGO_URI" --eval 'db.setProfilingLevel(0)'
```

## 1. Cap MongoDB memory

By default WiredTiger takes ~50% of RAM. Set it to 0.5 GB (2 GB VPS) or 1 GB (4 GB VPS).

Native install: edit `/etc/mongod.conf`

```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5
```

then `sudo systemctl restart mongod`.

Docker: `docker-compose.yml` already passes `--wiredTigerCacheSizeGB 0.5`; recreate
the container with `docker compose up -d mongo` (the data volume is kept).

## 2. Add swap (protects against OOM during deploy builds)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10 && echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

## 3. Switch PM2 to `ecosystem.config.cjs` (one time)

The ecosystem file runs the API from `apps/backend` (where its `.env` lives) and
the dashboards as the Next.js binary under node, with memory caps. PM2 keeps a
process's old script/cwd on reload, so re-register the three Workforce
processes once. `pm2 delete` only removes PM2's process entries — no files,
logs or data. Do not touch other apps (e.g. brandforge).

```bash
cd /var/www/workforce
pm2 delete workforce-api admin-dashboard employee-dashboard
APP_DIR=/var/www/workforce pm2 start ecosystem.config.cjs
pm2 save
pm2 install pm2-logrotate
```

## 4. Build the new database indexes

The API builds missing indexes on start, but running it deliberately at a quiet
time is gentler. It only creates indexes; it never drops indexes or documents.

```bash
cd /var/www/workforce/apps/backend
node dist/scripts/ensure-indexes.js
```

Check that a day query now uses the index (`IXSCAN` on `employeeId_1_timestamp_1`,
`totalDocsExamined` close to `nReturned`):

```bash
mongosh "$MONGO_URI" --eval '
  db.activityevents.find({ employeeId: "EMP001", timestamp: { $gte: new Date(Date.now() - 864e5) } })
    .explain("executionStats").executionStats'
```

## 5. Watch it

```bash
pm2 monit
free -m
```

With agents online and an admin clicking around, CPU should stay well below
100% and Mongo's resident memory should stay near the cache cap.
