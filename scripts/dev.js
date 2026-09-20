import { spawn } from 'child_process';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildElectron() {
  await esbuild.build({
    entryPoints: [path.resolve(rootDir, 'electron/main.ts')],
    platform: 'node',
    outfile: path.resolve(rootDir, 'dist-electron/main.js'),
    format: 'esm',
    target: 'node20',
    bundle: true,
    external: ['electron'],
  });
  await esbuild.build({
    entryPoints: [path.resolve(rootDir, 'electron/preload.ts')],
    platform: 'node',
    outfile: path.resolve(rootDir, 'dist-electron/preload.cjs'),
    format: 'cjs',
    target: 'node20',
    bundle: true,
    external: ['electron'],
  });
}

async function start() {
  console.log('[BB-Sequencer] Building Electron main & preload...');
  await buildElectron();

  console.log('[BB-Sequencer] Starting Vite dev server...');
  const isWindows = process.platform === 'win32';
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';

  const vite = spawn(npxCmd, ['vite'], {
    cwd: rootDir,
    stdio: 'pipe',
    shell: true,
  });

  vite.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(`[Vite] ${text}`);
    if (text.includes('Local:') || text.includes('http://localhost:5173')) {
      launchElectron();
    }
  });

  vite.stderr.on('data', (data) => {
    process.stderr.write(`[Vite Error] ${data.toString()}`);
  });

  let electronProcess = null;
  function launchElectron() {
    if (electronProcess) return;
    console.log('[BB-Sequencer] Spawning Electron...');
    electronProcess = spawn(npxCmd, ['electron', '.'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: 'http://localhost:5173',
      },
    });

    electronProcess.on('close', () => {
      console.log('[BB-Sequencer] Electron exited. Shutting down...');
      vite.kill();
      process.exit(0);
    });
  }
}

start().catch((err) => {
  console.error('[BB-Sequencer] Error in dev runner:', err);
  process.exit(1);
});
