const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const fixes = [
  [/navigate\(dmPath\(conv\.conversation_id\)\)/g, 'navigate(dmPath(conv))'],
  [/navigate\(dmPath\(conversation\.conversation_id\)\)/g, 'navigate(dmPath(conversation))'],
  [/navigate\(dmPath\(conv\.conversation_id \?\? conv\.id\)\)/g, 'navigate(dmPath(conv))'],
  [/navigate\(dmPath\(item\.data\.conversation_id\)\)/g, 'navigate(dmPath(item.data))'],
  [/navigate\(serverPath\(\{ id: team\.id, public_id: team\.id \}\)\)/g, 'navigate(serverPath(team))'],
  [/navigate\(serverPath\(\{ id: inviteInfo\.team\.id, public_id: inviteInfo\.team\.id \}\)\)/g, 'navigate(serverPath(inviteInfo.team))'],
  [/navigate\(serverPath\(\{ id: joinedTeam\.id, public_id: joinedTeam\.id \}\)\)/g, 'navigate(serverPath(joinedTeam))'],
  [/navigate\(serverPath\(\{ id: newTeam\.id, public_id: newTeam\.id \}\)\)/g, 'navigate(serverPath(newTeam))'],
  [/navigate\(serverPath\(\{ id: item\.data\.id, public_id: item\.data\.id \}\)\)/g, 'navigate(serverPath(item.data))'],
  [/navigate\(`\/channels\/@me\/\$\{m\.conversation_id\}`/g, 'navigate(dmPath({ conversation_id: m.conversation_id, public_id: m.conversation_public_id })'],
];

const srcRoot = path.join(__dirname, '..', 'src');
for (const file of walk(srcRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [re, rep] of fixes) s = s.replace(re, rep);
  const usesRoutes = /(dmPath|serverPath|serverChannelPath|channelSettingsPath)\(/.test(s);
  const hasImport = /from ['"]\.\.?\/utils\/appRoutes['"]/.test(s);
  if (usesRoutes && !hasImport) {
    const rel = path.relative(path.dirname(file), path.join(srcRoot, 'utils', 'appRoutes.js')).replace(/\\/g, '/');
    const importPath = rel.startsWith('.') ? rel : `./${rel}`.replace(/\.js$/, '');
    const importLine = `import { dmPath, serverPath, serverChannelPath, channelSettingsPath } from '${importPath.replace(/\.js$/, '')}';\n`;
    const m = s.match(/^import .+\n/m);
    if (m) {
      s = s.replace(m[0], m[0] + importLine);
    }
  }
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log('fixed', path.relative(srcRoot, file));
  }
}
