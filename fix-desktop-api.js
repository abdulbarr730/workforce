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
  'src/renderer/pages/DashboardPage.tsx',
  'package.json'
];

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, 'apps/desktop-agent', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Fix missing /api 
    content = content.replace(/"https:\/\/api\.prosyncedu\.com"/g, '"https://api.prosyncedu.com/api"');
    
    // Fix local dev URLs so it hits production server during pnpm run dev
    content = content.replace(/"http:\/\/localhost:5000\/api"/g, '"https://api.prosyncedu.com/api"');
    
    if (file === '.env.production') {
        content = content.replace('VITE_API_BASE_URL=https://api.prosyncedu.com/api/api', 'VITE_API_BASE_URL=https://api.prosyncedu.com/api');
        content = content.replace('API_URL=https://api.prosyncedu.com/', 'API_URL=https://api.prosyncedu.com/api');
    }

    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
});
