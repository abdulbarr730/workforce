import { NodeSSH } from 'node-ssh';
import fs from 'fs';

const ssh = new NodeSSH();

async function main() {
  console.log("Connecting to VPS...");
  await ssh.connect({
    host: '200.97.174.113',
    username: 'root',
    password: 'Limitless#24'
  });
  console.log("Connected!");

  const execute = async (command) => {
    console.log(`Executing: ${command}`);
    const result = await ssh.execCommand(command);
    console.log(`STDOUT: ${result.stdout}`);
    if (result.stderr) console.error(`STDERR: ${result.stderr}`);
    return result;
  };

  await execute('apt-get update -y');
  await execute('apt-get install -y curl git nginx ufw');
  
  // Install Node 20
  await execute('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
  await execute('apt-get install -y nodejs');
  
  // Install PM2
  await execute('npm install -g pm2');

  // Setup directory
  await execute('mkdir -p /var/www/workforce');
  
  // Clone repo (Assuming public repo or we can just use https URL, it's public: https://github.com/abdulbarr730/workforce.git)
  await execute('cd /var/www && rm -rf workforce && git clone https://github.com/abdulbarr730/workforce.git workforce');
  
  // Setup .env
  const envContent = `PORT=5000\nMONGO_URI="mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority"\nJWT_SECRET="qxmSrmL9neblRKCMzxuXrWc2ErlzEAUUjENUnOR2BnC"`;
  await ssh.execCommand(`cat << 'EOF' > /var/www/workforce/apps/backend/.env\n${envContent}\nEOF`);

  // Install dependencies and build
  await execute('cd /var/www/workforce && npm install');
  await execute('cd /var/www/workforce && npm run build'); // This might build both frontend and desktop agent... wait, we only want to build frontend and backend.
  // Wait, workforce root package.json has npm run build which might run concurrently or turbo.
  // Actually, let's just install in root, then backend and frontend separately if needed, or run the build command if it builds them.
  
  // Start PM2
  await execute('cd /var/www/workforce/apps/backend && pm2 start dist/index.js --name "workforce-api"');
  await execute('pm2 save');
  await execute('pm2 startup ubuntu -u root --hp /root');

  // Setup Nginx
  const nginxConfig = `
server {
    listen 80;
    server_name hr.prosyncedu.com;

    location / {
        root /var/www/workforce/apps/frontend/dist;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
  await ssh.execCommand(`cat << 'EOF' > /etc/nginx/sites-available/workforce\n${nginxConfig}\nEOF`);
  await execute('ln -s /etc/nginx/sites-available/workforce /etc/nginx/sites-enabled/');
  await execute('rm -f /etc/nginx/sites-enabled/default');
  await execute('systemctl restart nginx');
  
  console.log("Setup complete!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
