import { NodeSSH } from 'node-ssh';
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

  // 1. Pull latest code (which now has the missing lib/ files)
  await execute('cd /var/www/workforce && git pull origin main');

  // 2. Write Backend Environment Variables
  const backendEnv = `PORT=5000
MONGO_URI="mongodb://support_db_user:1234567890@ac-iv6txvg-shard-00-00.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-01.0dqgewm.mongodb.net:27017,ac-iv6txvg-shard-00-02.0dqgewm.mongodb.net:27017/workforce-platform?ssl=true&replicaSet=atlas-10rgcs-shard-0&authSource=admin&retryWrites=true&w=majority"
JWT_SECRET="qxmSrmL9neblRKCMzxuXrWc2ErlzEAUUjENUnOR2BnC"
SESSION_SECRET="HP%Z%S>w5m{!G+Y$"
CLOUDINARY_API_KEY="361172594697472"
CLOUDINARY_API_SECRET="NchGGrqRbiSMdR010EcRkkmYms4"
CLOUDINARY_CLOUD_NAME="dqf2j7ifc"
`;
  await ssh.execCommand(`cat << 'EOF' > /var/www/workforce/apps/backend/.env\n${backendEnv}\nEOF`);

  // 3. Write Frontend Environment Variables (must be present for build!)
  const frontendEnv = `NEXT_PUBLIC_API_URL=https://hr.prosyncedu.com/api\n`;
  await ssh.execCommand(`cat << 'EOF' > /var/www/workforce/apps/employee-dashboard/.env.production\n${frontendEnv}\nEOF`);
  await ssh.execCommand(`cat << 'EOF' > /var/www/workforce/apps/admin-dashboard/.env.production\n${frontendEnv}\nEOF`);

  // 4. Install dependencies and build with pnpm
  await execute('cd /var/www/workforce && pnpm install');
  await execute('cd /var/www/workforce && pnpm run build');
  
  // 5. Restart PM2 (or start it)
  await execute('cd /var/www/workforce/apps/backend && pm2 restart workforce-api || pm2 start dist/server.js --name "workforce-api"');
  await execute('pm2 save');
  
  console.log("Fix complete!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
