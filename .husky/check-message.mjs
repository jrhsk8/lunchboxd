/**
 * The commit-msg check: the mechanical rules from docs/writing/prose.md.
 *
 * Node rather than shell, because the rules need line-by-line handling and a
 * portable shell script doing the same would be harder to read than the rules
 * it enforces. Every refusal names the rule and quotes the offending line, so
 * the message can be fixed without opening the doc.
 *
 * Deliberately silent about tense, vocabulary and whether the body earns its
 * place — see the doc for why the hook must not guess at those.
 */
import { readFileSync } from 'node:fs';

const SUBJECT_MAX = 72;
const BODY_MAX = 72;

/** `v0.7.0 — likes, calling cards…`, the one licensed subject form. */
const RELEASE = /^v\d+\.\d+\.\d+ — \S/;

/** Attribution trailers the project bans outright, in any casing. */
const BANNED = [/^co-authored-by:/i, /generated with/i, /🤖/, /^signed-off-by:/i];

const lines = readFileSync(process.argv[2], 'utf8')
  .split(/\r?\n/)
  // A comment line here is git's own scaffolding, not the message.
  .filter((line) => !line.startsWith('#'));

// Trailing blank lines are git's, not the author's.
while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

const problems = [];
const [subject = '', ...rest] = lines;

// A merge or a fixup is written by git, so the standard doesn't apply to it.
const generated = /^(Merge|Revert|fixup!|squash!)\b/.test(subject);

if (!generated && !RELEASE.test(subject)) {
  if (subject.length > SUBJECT_MAX) {
    problems.push(`Subject is ${subject.length} characters; the cap is ${SUBJECT_MAX}.`);
  }
  if (/[.!?]$/.test(subject)) {
    problems.push('Subject ends with punctuation; it takes none.');
  }
  // Sentence case, with one exception: a subject may open with an identifier
  // the code actually spells that way. Capitalising `useCategoryNames` would
  // name a symbol that doesn't exist, so the rule would be demanding a lie.
  const opensWithIdentifier = /^(`|[a-z][A-Za-z0-9]*[A-Z]|[a-z][a-z0-9]*[._][A-Za-z0-9])/.test(
    subject,
  );
  if (!/^[A-Z]/.test(subject) && !opensWithIdentifier) {
    problems.push('Subject starts lowercase; it is sentence case.');
  }
}

if (rest.length && rest[0].trim() !== '') {
  problems.push('Body must be separated from the subject by a blank line.');
}

// URLs and fenced blocks are unwrappable by nature; wrapping them would break
// what they are, so the length rule steps aside for both.
let fenced = false;
for (const line of rest) {
  if (line.trimStart().startsWith('```')) fenced = !fenced;
  const unwrappable = fenced || /\bhttps?:\/\/\S/.test(line) || /^\s{4,}\S/.test(line);
  if (!unwrappable && line.length > BODY_MAX) {
    problems.push(`Body line is ${line.length} characters; wrap at ${BODY_MAX}:\n    ${line}`);
  }
}

for (const line of lines) {
  if (BANNED.some((pattern) => pattern.test(line.trim()))) {
    problems.push(`Banned trailer — no attribution of any kind:\n    ${line.trim()}`);
  }
}

if (problems.length) {
  console.error('\nThis commit message breaks the standard in docs/writing/prose.md:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\nFix it, or use --no-verify if the check is the thing that is wrong.\n');
  process.exit(1);
}
