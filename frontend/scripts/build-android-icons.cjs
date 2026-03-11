const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
const androidProject = path.join(__dirname, '../android');

// Check for slide_icon.png in same locations as build-icon.cjs
const possibleSources = [
  path.join(__dirname, '../../..', 'slide_icon.png'),
  path.join(__dirname, '../..', 'slide_icon.png'),
  path.join(__dirname, '..', 'slide_icon.png'),
  path.join(__dirname, '../public', 'icon.png'),
];
const iconSource = possibleSources.find((p) => fs.existsSync(p));

if (!iconSource) {
  console.error('No icon found. Place slide_icon.png on Desktop, in project root, or public/icon.png');
  process.exit(1);
}

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const destIcon = path.join(assetsDir, 'icon.png');
fs.copyFileSync(iconSource, destIcon);
console.log('Copied icon to assets/icon.png from', iconSource);

// Also copy to public for web app (server list logo, favicon, auth pages)
fs.copyFileSync(iconSource, path.join(publicDir, 'logo.png'));
fs.copyFileSync(iconSource, path.join(publicDir, 'icon.png'));
console.log('Copied icon to public/logo.png and public/icon.png');
