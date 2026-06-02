const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendDir, '..');
const releaseDir = path.join(frontendDir, 'release');
const downloadsDir = path.join(repoRoot, 'backend', 'downloads');
const packageJson = JSON.parse(fs.readFileSync(path.join(frontendDir, 'package.json'), 'utf8'));

if (!fs.existsSync(releaseDir)) {
  throw new Error(`Release directory not found: ${releaseDir}`);
}

const installers = fs.readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.exe')
  .map((entry) => {
    const filePath = path.join(releaseDir, entry.name);
    const stat = fs.statSync(filePath);
    return { name: entry.name, filePath, mtimeMs: stat.mtimeMs };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

if (installers.length === 0) {
  throw new Error(`No .exe installer found in ${releaseDir}`);
}

fs.mkdirSync(downloadsDir, { recursive: true });

const publicName = `Slide_Alpha_v${packageJson.version}.exe`;
const destination = path.join(downloadsDir, publicName);

fs.copyFileSync(installers[0].filePath, destination);

console.log(`Published ${installers[0].name} -> ${destination}`);
