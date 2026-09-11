import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirectories = new Set(['node_modules', 'target', 'dist', 'build', '.git', '.openai', '.wrangler', '.vite', '.next', '.vinext', 'artifacts', 'test-results']);
const entries = {};
async function collect(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name) || entry.name.startsWith('target-') || name === 'website/public/playground' || name === 'website/public/downloads') continue;
      await collect(path.join(directory, entry.name), name);
    } else {
      if (entry.name.startsWith('.env') || /\.(pem|key|pfx|p12|zip|exe|msi|tar|gz)$/i.test(entry.name) || /\.(log|tsbuildinfo|db(?:-.+)?|sqlite\d?(?:-.+)?)$/i.test(entry.name) || entry.name === 'audit-report.json' || entry.name.endsWith('-audit.json')) continue;
      entries[`astral-sql/${name}`] = new Uint8Array(await readFile(path.join(directory, entry.name)));
    }
  }
}
await collect(root);
const data = zipSync(entries, { level: 9 });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await mkdir(path.join(root, 'website/public/downloads'), { recursive: true });
const archive = path.join(root, 'artifacts/astral-sql-source.zip');
await writeFile(archive, data);
await writeFile(path.join(root, 'website/public/downloads/astral-sql-source.zip'), data);
console.log(`${archive} (${Object.keys(entries).length} source files, ${data.length} bytes)`);
