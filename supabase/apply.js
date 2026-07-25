// Applies SQL to the hosted Supabase project via the Management API.
//
// Migrations live in supabase/migrations/ and are applied here — there is no
// local Supabase stack (WSL is ruled out for this project), so the hosted
// database is the only target. Everything must stay inside the `lunchboxd`
// schema: the project is shared with gambdle.net, whose tables are in `public`.
//
//   node supabase/apply.js migrations/20260725120000_thing.sql   apply a file
//   node supabase/apply.js -e "select count(*) from lunchboxd.rankings"
//
// Reuses the Supabase PAT the MCP server already stores in ~/.claude.json —
// the user's own token for the user's own project. It is never printed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = 'kxbteesmfozqzoxzktzv';

export function readToken() {
  const cfg = fs.readFileSync(
    path.join(process.env.USERPROFILE || process.env.HOME, '.claude.json'),
    'utf8',
  );
  const m = cfg.match(/sbp_[A-Za-z0-9]+/);
  if (!m) throw new Error('no supabase access token found in ~/.claude.json');
  return m[0];
}

export async function run(query, token = readToken()) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 1500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('apply.js')) {
  const args = process.argv.slice(2);
  let sql;
  if (args[0] === '-e') {
    sql = args[1];
  } else {
    const file = path.isAbsolute(args[0]) ? args[0] : path.join(HERE, args[0]);
    sql = fs.readFileSync(file, 'utf8');
    console.log(`applying ${path.basename(file)} (${sql.length} bytes)`);
  }
  const out = await run(sql);
  console.log(
    typeof out === 'string' ? out.slice(0, 4000) : JSON.stringify(out, null, 2).slice(0, 4000),
  );
}
