const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const packagePath = path.join(frontendDir, 'package.json');
const lockPath = path.join(frontendDir, 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function bumpPatch(version) {
  const parts = String(version || '0.0.0').split('.').map((part) => parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join('.');
}

const packageJson = readJson(packagePath);
const nextVersion = process.env.SLIDE_ELECTRON_VERSION || bumpPatch(packageJson.version);

packageJson.version = nextVersion;
writeJson(packagePath, packageJson);

if (fs.existsSync(lockPath)) {
  const lockJson = readJson(lockPath);
  lockJson.version = nextVersion;
  if (lockJson.packages?.['']) {
    lockJson.packages[''].version = nextVersion;
  }
  writeJson(lockPath, lockJson);
}

console.log(`Slide Electron version: ${nextVersion}`);
