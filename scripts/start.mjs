import { cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
// Local ignored environment file; deploys normally supply environment variables directly.
try { process.loadEnvFile(fileURLToPath(new URL('.env.local', root))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const standalone = new URL('.next/standalone/', root);
await access(new URL('server.js', standalone));
await cp(new URL('public/', root), new URL('public/', standalone), { recursive: true });
await cp(new URL('.next/static/', root), new URL('.next/static/', standalone), { recursive: true });
process.env.HOSTNAME ||= '127.0.0.1';
process.env.PORT ||= '4174';
// The generated standalone server owns the HTTP lifecycle.
process.chdir(fileURLToPath(standalone));
await import(new URL('server.js', standalone).href);
