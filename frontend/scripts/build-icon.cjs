const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const publicDir = path.join(__dirname, '../public');
const buildDir = path.join(__dirname, '../build');
const iconIco = path.join(buildDir, 'icon.ico');

const possibleSources = [
  path.join(__dirname, '../../..', 'slide_icon.png'),
  path.join(__dirname, '../..', 'slide_icon.png'),
  path.join(__dirname, '..', 'slide_icon.png'),
  path.join(publicDir, 'icon.png'),
  path.join(__dirname, '../../docs', 'icon.png'),
];
const iconPng = possibleSources.find((p) => fs.existsSync(p));

async function main() {
  if (!iconPng) {
    console.error('No icon found. Place slide_icon.png on Desktop, in project root, or public/icon.png');
    process.exit(1);
  }
  console.log('Using icon:', iconPng);

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const input = fs.readFileSync(iconPng);
  const buf = await toIco(input, { resize: true, sizes: [16, 24, 32, 48, 64, 128, 256] });
  fs.writeFileSync(iconIco, buf);
  fs.copyFileSync(iconIco, path.join(buildDir, 'installerHeaderIcon.ico'));
  console.log('Created build/icon.ico');
}

main().catch((err) => {
  console.error('Failed to create icon.ico:', err);
  process.exit(1);
});
