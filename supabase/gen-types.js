// Regenerates src/database.types.ts from the live `lunchboxd` schema.
//
//   npm run types
//
// Run this after every migration. The generated types are what stops a renamed
// column or a dropped select field compiling clean and failing at runtime —
// data.ts used to carry an `as unknown as` cast at every read site, which
// defeated the checker entirely.
//
// Uses the same PAT as apply.js, passed to the CLI by env rather than printed.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readToken } from './apply.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'database.types.ts');
const REF = 'kxbteesmfozqzoxzktzv';

const types = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', REF, '--schema', 'lunchboxd'],
  {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: readToken() },
    maxBuffer: 32e6,
  },
);

fs.writeFileSync(OUT, types);
console.log(`wrote src/database.types.ts (${types.length} bytes)`);
