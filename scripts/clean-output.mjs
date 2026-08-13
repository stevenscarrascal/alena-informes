import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outputDir = path.join(root, '.output');

function stopNodeServerFromOutput() {
  try {
    const result = execFileSync('wmic', ['process', 'where', "name='node.exe'", 'get', 'ProcessId,CommandLine', '/format:list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const lines = result.split(/\r?\n/);
    const block = [];
    let current = null;

    for (const line of lines) {
      if (!line.trim()) {
        if (current) {
          block.push(current);
          current = null;
        }
        continue;
      }

      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!current) current = {};
      current[key] = value;
    }

    if (current) block.push(current);

    for (const entry of block) {
      const cmd = entry.CommandLine ?? '';
      if (cmd.includes('.output/server/index.mjs') || cmd.includes('\\.output\\server\\index.mjs')) {
        const pid = Number(entry.ProcessId);
        if (Number.isFinite(pid) && pid > 0) {
          try {
            execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
          } catch {
            // No-op: the process may already be gone by the time we try to kill it.
          }
        }
      }
    }
  } catch {
    // Ignore if wmic is unavailable or the process is already gone.
  }
}

if (fs.existsSync(outputDir)) {
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      stopNodeServerFromOutput();
      try {
        fs.rmSync(outputDir, { recursive: true, force: true });
      } catch {
        console.warn('No se pudo limpiar .output porque un proceso de Node sigue usando un archivo del build. Cierra manualmente el servidor y vuelve a ejecutar npm run build.');
        process.exit(1);
      }
    } else {
      throw error;
    }
  }
}
