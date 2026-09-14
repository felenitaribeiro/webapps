import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function greedyExecutable() {
  const target = { 'darwin-arm64': 'macos-arm64', 'linux-x64': 'linux-x64', 'win32-x64': 'windows-x64' }[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`Greedy does not provide a binary for ${process.platform}-${process.arch}.`);
  const filename = process.platform === 'win32' ? 'greedy-rs.exe' : 'greedy-rs';
  const executable = fileURLToPath(new URL(`../native/${target}/${filename}`, import.meta.url));
  if (!existsSync(executable)) throw new Error('Greedy native binary is missing. Install the complete release tarball.');
  return executable;
}

/** Run the native Greedy CLI with file paths and flags. Resolves when output files are ready. */
export function runGreedy(args, { cwd, signal, stdio = 'inherit' } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('Greedy arguments must be an array of strings.');
  }
  const executable = greedyExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, signal, stdio, windowsHide: true });
    child.once('error', reject);
    child.once('close', (code, terminationSignal) => {
      if (code === 0) resolve();
      else {
        const error = new Error(`Greedy ${terminationSignal ? `terminated by ${terminationSignal}` : `exited with code ${code}`}.`);
        error.exitCode = code;
        error.signal = terminationSignal;
        reject(error);
      }
    });
  });
}
