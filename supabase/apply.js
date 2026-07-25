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

/** The hosted project, shared with gambdle.net. Imported by gen-types.js. */
export const REF = 'kxbteesmfozqzoxzktzv';

/**
 * The Supabase PAT, read by the key that names it.
 *
 * ~/.claude.json holds every project's MCP config, so scanning the file for an
 * `sbp_` prefix returned whichever token sorted earliest — another project's,
 * given the chance, and the failure is a permission error against somebody
 * else's database rather than a missing-token one (#116). Two entries there
 * carry a token today and they are the same token; distinct ones are a
 * question this cannot answer, so it asks rather than picks.
 */
export function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;

  const cfg = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.claude.json'), 'utf8'),
  );
  const tokens = new Set();
  for (const project of Object.values(cfg.projects ?? {})) {
    for (const server of Object.values(project?.mcpServers ?? {})) {
      const token = server?.env?.SUPABASE_ACCESS_TOKEN;
      if (token) tokens.add(token);
    }
  }

  if (tokens.size === 0)
    throw new Error(
      'no SUPABASE_ACCESS_TOKEN in ~/.claude.json; set it in the environment instead',
    );
  if (tokens.size > 1)
    throw new Error(
      `~/.claude.json holds ${tokens.size} different Supabase tokens; set SUPABASE_ACCESS_TOKEN to say which`,
    );
  return [...tokens][0];
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

/** Transaction control at the start of a line, ignoring `--` comments. */
const OWN_TRANSACTION = /^\s*(begin|commit|rollback|start\s+transaction|end)\b/im;

/**
 * A migration, wrapped so it lands whole or not at all.
 *
 * The endpoint runs a whole file as one batch with no transaction of its own,
 * so a migration failing at its fourth statement used to leave the schema in a
 * state neither the file nor the repo describes — and there is no local stack
 * to discover that on, because the only target is production (#115).
 *
 * A file carrying its own `begin`/`commit` is refused rather than nested:
 * Postgres treats a nested `begin` as a warning and ignores it, so wrapping
 * one would silently produce something other than what the file says. The two
 * statements that genuinely cannot run inside a transaction — `create index
 * concurrently` and `alter type … add value` before PG12 — need `-e` or a file
 * that opts out by writing its own transaction control.
 */
function wrapInTransaction(sql, name) {
  if (OWN_TRANSACTION.test(sql)) {
    throw new Error(
      `${name} carries its own transaction control; run it with -e if that is deliberate`,
    );
  }
  return `begin;\n${sql}\ncommit;`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('apply.js')) {
  const args = process.argv.slice(2);
  let sql;
  if (args[0] === '-e') {
    sql = args[1];
  } else {
    const file = path.isAbsolute(args[0]) ? args[0] : path.join(HERE, args[0]);
    const name = path.basename(file);
    sql = wrapInTransaction(fs.readFileSync(file, 'utf8'), name);
    console.log(`applying ${name} (${sql.length} bytes, in one transaction)`);
  }
  const out = await run(sql);
  console.log(
    typeof out === 'string' ? out.slice(0, 4000) : JSON.stringify(out, null, 2).slice(0, 4000),
  );
}
