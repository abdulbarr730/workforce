const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  '.env.production',
  'src-electron/main.ts',
  'src-electron/shift-watcher.ts',
  'src-electron/tracking/device-error.logger.ts',
  'src-electron/tracking/screenshot.tracker.ts',
  'src-electron/tracking/upload.service.ts',
  'src-electron/work-session/session.orchestrator.ts',
  'src-electron/tracking/activity.tracker.ts',
  'src-electron/tracking/idle.tracker.ts',
  'package.json'
];

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, 'apps/desktop-agent', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/https:\/\/prosync-backend\.onrender\.com\/api/g, 'https://api.prosyncedu.com');
    content = content.replace(/https:\/\/prosync-backend\.onrender\.com\//g, 'https://api.prosyncedu.com/');
    content = content.replace(/https:\/\/prosync-backend\.onrender\.com/g, 'https://api.prosyncedu.com');
    content = content.replace(/https:\/\/hr\.prosyncedu\.com\/api/g, 'https://api.prosyncedu.com');
    if (file === 'package.json') {
       content = content.replace(/"version": "1.0.\d+"/, '"version": "1.0.81"');
    }
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
});
