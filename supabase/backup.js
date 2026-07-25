// Backs up the `lunchboxd` schema's data to a timestamped JSON file.
//
// Why not pg_dump: the schema cohabits Gambdle's Supabase project, so a
// project-level restore would drag Gambdle back with it — the backup has to be
// schema-scoped. This box has no pg_dump, psql or Supabase CLI installed, so
// the Management API's query endpoint is the available route. See
// docs/meta/deploy.md for the pg_dump path once a client is installed, and for
// the restore procedure.
//
// The migrations in supabase/migrations/ ARE the schema definition, so
// migrations + this data dump is a complete restore. That is the whole
// contract: this file backs up rows, not DDL.
//
//   node supabase/backup.js                 → ../lunchboxd-backups/<stamp>.json
//   node supabase/backup.js <directory>
//
// Dumps land OUTSIDE the repo by default: they hold every user's handle and
// every ranking, and must never be committed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './apply.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = ['profiles', 'categories', 'rankings'];

const outDir = process.argv[2] || path.join(HERE, '..', '..', 'lunchboxd-backups');
fs.mkdirSync(outDir, { recursive: true });

const dump = { schema: 'lunchboxd', taken_at: new Date().toISOString(), tables: {} };

for (const t of TABLES) {
  // to_jsonb keeps every column without naming them here, so a new column is
  // captured by the next backup rather than silently dropped.
  const rows = await run(`select to_jsonb(t) as row from lunchboxd.${t} t`);
  dump.tables[t] = rows.map((r) => r.row);
  console.log(`  ${t}: ${dump.tables[t].length} rows`);
}

const stamp = dump.taken_at.replace(/[:.]/g, '-');
const file = path.join(outDir, `lunchboxd-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`\nwrote ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
