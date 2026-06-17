import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const accountIndex = process.argv[2];
const statePath = process.argv[3] ?? process.env.LITMEDIA_STORAGE_STATE_PATH ?? 'auth/litmedia.storageState.json';
const secretName = accountIndex
  ? `LITMEDIA_STORAGE_STATE_BASE64_${accountIndex}`
  : 'LITMEDIA_STORAGE_STATE_BASE64';

const raw = await readFile(statePath, 'utf8').catch((error) => {
  throw new Error(`Could not read ${statePath}: ${error.message}`);
});

validateStorageState(raw, statePath);

const base64 = Buffer.from(raw, 'utf8').toString('base64');
await copyToClipboard(base64);

console.log(`Copied ${secretName} value to clipboard.`);
console.log(`Paste it into GitHub repository Secret: ${secretName}`);
console.log(`Source file: ${statePath}`);

function validateStorageState(value, path) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
    throw new Error(`${path} does not look like a Playwright storage state file.`);
  }
}

async function copyToClipboard(value) {
  if (process.platform === 'win32') {
    await runClipboardCommand('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value $input'], value);
    return;
  }

  if (process.platform === 'darwin') {
    await runClipboardCommand('pbcopy', [], value);
    return;
  }

  await runClipboardCommand('xclip', ['-selection', 'clipboard'], value).catch(async () => {
    await runClipboardCommand('xsel', ['--clipboard', '--input'], value);
  });
}

function runClipboardCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });

    child.stdin.end(input);
  });
}
