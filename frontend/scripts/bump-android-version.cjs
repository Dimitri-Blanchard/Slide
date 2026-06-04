const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const gradlePath = path.join(frontendDir, 'android', 'app', 'build.gradle');

function bumpPatch(version) {
  const parts = String(version || '0.0.0').split('.').map((part) => parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join('.');
}

function readRequiredEnvInt(name) {
  if (!process.env[name]) return null;

  const value = parseInt(process.env[name], 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

const buildGradle = fs.readFileSync(gradlePath, 'utf8');
const versionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);
const versionNameMatch = buildGradle.match(/versionName\s+"([^"]+)"/);

if (!versionCodeMatch || !versionNameMatch) {
  throw new Error('Could not find versionCode and versionName in android/app/build.gradle.');
}

const currentVersionCode = parseInt(versionCodeMatch[1], 10);
const nextVersionCode = readRequiredEnvInt('SLIDE_ANDROID_VERSION_CODE') || currentVersionCode + 1;
const nextVersionName = process.env.SLIDE_ANDROID_VERSION_NAME || bumpPatch(versionNameMatch[1]);

if (nextVersionCode <= currentVersionCode) {
  throw new Error(
    `SLIDE_ANDROID_VERSION_CODE (${nextVersionCode}) must be greater than current versionCode (${currentVersionCode}).`,
  );
}

const nextBuildGradle = buildGradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${nextVersionName}"`);

fs.writeFileSync(gradlePath, nextBuildGradle, 'utf8');

console.log(`Slide Android version: ${nextVersionName} (${nextVersionCode})`);
