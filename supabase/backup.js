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
// migrations + this data dump restores the `lunchboxd` schema and its rows.
// That is the whole contract: this file backs up rows, not DDL.
//
// What it cannot restore on its own: every profile is a foreign key into
// `auth.users`, which belongs to Supabase and is not dumped here. Into an
// empty project, the profile inserts would fail. This is a recovery tool for
// rows after a bad migration, not a way to rebuild the site from nothing.
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

/**
 * Every base table in the schema, parents before children.
 *
 * Asked rather than listed: the hardcoded list said profiles, categories and
 * rankings, and stayed saying it when `likes` and `notifications` shipped — so
 * the backup was silently missing two tables for as long as they existed, and
 * a like is the one row here that regenerates from nothing.
 *
 * The order is a topological sort over the schema's own foreign keys, because
 * a restore has to insert a parent before its children and the dump is what
 * carries that order.
 */
async function tablesInDependencyOrder() {
  const tables = (
    await run(`select c.relname as name
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'lunchboxd' and c.relkind = 'r'
                order by c.relname`)
  ).map((r) => r.name);

  const edges = (
    await run(`select child.relname as child, parent.relname as parent
                 from pg_constraint k
                 join pg_class child on child.oid = k.conrelid
                 join pg_class parent on parent.oid = k.confrelid
                 join pg_namespace cn on cn.oid = child.relnamespace
                 join pg_namespace pn on pn.oid = parent.relnamespace
                where k.contype = 'f'
                  and cn.nspname = 'lunchboxd' and pn.nspname = 'lunchboxd'`)
  ).filter((e) => e.child !== e.parent);

  const ordered = [];
  const placed = new Set();
  // A cycle would loop forever, so the pass count is capped at the table count:
  // whatever is left after that is emitted in name order rather than dropped.
  for (let pass = 0; pass < tables.length && placed.size < tables.length; pass++) {
    for (const t of tables) {
      if (placed.has(t)) continue;
      const waiting = edges.some((e) => e.child === t && !placed.has(e.parent));
      if (!waiting) {
        ordered.push(t);
        placed.add(t);
      }
    }
  }
  return [...ordered, ...tables.filter((t) => !placed.has(t))];
}

const TABLES = await tablesInDependencyOrder();

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
