const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const releaseDir = path.resolve(__dirname, '..', 'release');
const winUnpackedDir = path.join(releaseDir, 'win-unpacked');
const winAppExe = path.join(winUnpackedDir, 'Slide.exe');
const staleWinUnpackedPrefix = 'win-unpacked.locked-';

function removeFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    fs.rmSync(filePath, { force: true });
    console.log(`Removed ${path.relative(process.cwd(), filePath) || filePath}`);
  } catch (error) {
    console.warn(`Could not remove ${filePath}: ${error.message}`);
  }
}

function removePartialNsisArtifacts() {
  if (!fs.existsSync(releaseDir)) return;

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    const fullPath = path.join(releaseDir, entry.name);
    if (entry.isFile()) {
      if (
        entry.name.endsWith('.nsis.7z') ||
        entry.name.startsWith('__uninstaller-nsis-')
      ) {
        removeFileIfExists(fullPath);
      }
      continue;
    }

    if (entry.isDirectory() && entry.name.startsWith('nsis-web')) {
      removeDirectoryWithRetries(fullPath);
    }
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function terminatePreviousWindowsApp() {
  if (process.platform !== 'win32' || !fs.existsSync(winAppExe)) {
    return;
  }

  const escapedExe = winAppExe.replace(/'/g, "''");
  const command = [
    `$target = '${escapedExe}'`,
    'foreach ($process in [System.Diagnostics.Process]::GetProcesses()) {',
    '  try {',
    '    $path = $process.MainModule.FileName',
    '    if ($path -and ([System.IO.Path]::GetFullPath($path) -ieq $target)) {',
    '      Write-Host "Stopping previous release process $($process.Id): $path"',
    '      $process.Kill()',
    '      $process.WaitForExit(5000)',
    '    }',
    '  } catch {',
    '    # Some system processes do not expose MainModule to the current user.',
    '  }',
    '}',
  ].join('\n');

  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'inherit' },
    );
  } catch (error) {
    console.warn(`Could not check for running ${path.basename(winAppExe)} processes; continuing cleanup.`);
  }
}

function removeDirectoryWithRetries(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const attempts = 10;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`Removed ${path.relative(process.cwd(), dir) || dir}`);
      return;
    } catch (error) {
      if (attempt === attempts) {
        const renamedDir = renameLockedDirectory(dir);
        if (renamedDir) {
          console.warn(`Could not fully delete ${dir}; moved locked release to ${renamedDir}`);
          return;
        }

        throw error;
      }

      console.log(`Release directory is still locked; retrying cleanup (${attempt}/${attempts})...`);
      sleep(500);
    }
  }
}

function renameLockedDirectory(dir) {
  const parentDir = path.dirname(dir);
  const baseName = path.basename(dir);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const destination = path.join(parentDir, `${baseName}.locked-${Date.now()}-${attempt}`);

    try {
      fs.renameSync(dir, destination);
      return destination;
    } catch {
      sleep(500);
    }
  }

  return null;
}

function removeStaleLockedDirectories() {
  if (!fs.existsSync(releaseDir)) {
    return;
  }

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(staleWinUnpackedPrefix)) {
      continue;
    }

    removeDirectoryWithRetries(path.join(releaseDir, entry.name));
  }
}

terminatePreviousWindowsApp();
removeStaleLockedDirectories();
removePartialNsisArtifacts();
removeDirectoryWithRetries(winUnpackedDir);
