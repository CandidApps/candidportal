#!/usr/bin/env node
/**
 * Toggle where app-created data is stored during development.
 *
 *   npm run persistence:local   → browser localStorage (no Supabase writes for member/admin test data)
 *   npm run persistence:db      → Supabase (normal)
 *   npm run persistence:clear   → wipe local test data from this browser's storage
 *
 * Sets NEXT_PUBLIC_DATA_PERSISTENCE in .env.local (creates the file if missing).
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env.local');
const KEY = 'NEXT_PUBLIC_DATA_PERSISTENCE';
const mode = process.argv[2];

if (!mode || !['local', 'supabase', 'clear'].includes(mode)) {
  console.error(`
Usage:
  node scripts/persistence-mode.mjs local     # test data → browser localStorage
  node scripts/persistence-mode.mjs supabase  # test data → Supabase (production-like)
  node scripts/persistence-mode.mjs clear     # remove local test data (localStorage only)

Or use npm scripts:
  npm run persistence:local
  npm run persistence:db
  npm run persistence:clear
`);
  process.exit(1);
}

if (mode === 'clear') {
  console.log(`
To clear local test data, run this in the browser console while the app is open:

  localStorage.removeItem('candid-local-persistence-v1')

Then refresh the page.
`);
  process.exit(0);
}

let lines = [];
if (fs.existsSync(envPath)) {
  lines = fs.readFileSync(envPath, 'utf8').split('\n');
}

const nextLine = `${KEY}=${mode}`;
let found = false;
const out = lines.map((line) => {
  if (line.startsWith(`${KEY}=`)) {
    found = true;
    return nextLine;
  }
  return line;
});
if (!found) {
  if (out.length && out[out.length - 1] !== '') out.push('');
  out.push(`# App-created test data: local = localStorage, supabase = database`);
  out.push(nextLine);
}

fs.writeFileSync(envPath, out.join('\n').replace(/\n*$/, '\n'));

console.log(mode === 'local'
  ? `✓ ${KEY}=local — restart \`npm run dev\` if it is already running.
  Uploads, services, and analysis reviews stay in this browser only.
  Auth and partner config still use Supabase.`
  : `✓ ${KEY}=supabase — restart \`npm run dev\` if it is already running.
  App-created data will be saved to Supabase again.`);
