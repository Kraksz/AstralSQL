import { readFile, writeFile } from 'node:fs/promises';

// Preserve Vite's generated module and asset configuration. Keep this separate
// from the Sites deployment so either hosting destination remains reproducible.
const directory = new URL('../dist/server/', import.meta.url);
const config = JSON.parse(await readFile(new URL('wrangler.json', directory), 'utf8'));
config.name = 'astral-sql';
config.account_id = '7e5dd85b46d1b45abe2f467f9e27657b';
config.routes = [{ pattern: 'sql.astralworks.xyz', custom_domain: true }];
config.workers_dev = false;
config.preview_urls = false;
config.observability = { enabled: false };
await writeFile(new URL('wrangler.astral.json', directory), JSON.stringify(config, null, 2) + '\n');
console.log('Cloudflare deployment prepared for sql.astralworks.xyz.');
