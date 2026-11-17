// token-radar-01 entry: the sealed snapshot in, a ranked board and a static dashboard out.
//
// Run by the grader with main.ts at the repository root, Node 22, no network and a read-only /bot:
// it reads /input/snapshot.json, scores every pre-token protocol with lib/model.ts, writes board.json
// and data.js into /output, copies dashboard/ and screenshots/ there, and writes dossier.json last
// with the vendored make.fun library. Both grader runs must write the same bytes, so nothing here
// reads a clock or a source of randomness.
//
// Locally:
//   mkdir -p out && node main.ts --input ../input/snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}\.(png|jpe?g)$/i;
const here = fileURLToPath(new URL('.', import.meta.url));

/** --name <value>, --name=value, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

if (!existsSync(inputFile)) {
  console.error(`token radar: no snapshot at ${inputFile} (pass --input <snapshot.json|dir>)`);
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  console.error(`token radar: the board would fail the gate: ${issue}`);
  process.exit(1);
}

/** Copy a directory's regular files, refusing symlinks and dot-names; returns the copied names. */
function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  const names: string[] = [];
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const stat = statSync(path);
    if (!stat.isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

const shotNames = readdirSync(join(here, 'screenshots'))
  .filter((name) => !name.startsWith('.') && IMAGE_NAME.test(name))
  .sort();
if (shotNames.length < 3 || shotNames.length > SCREENSHOT_CAPS.max) {
  console.error(`token radar: screenshots/ holds ${shotNames.length} images; hand in 3 or 4`);
  process.exit(1);
}
for (const name of shotNames) {
  const size = statSync(join(here, 'screenshots', name)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) {
    console.error(`token radar: screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_CAPS.max_bytes} cap`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });
for (const name of readdirSync(out)) rmSync(join(out, name), { recursive: true, force: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
const dashNames = copyFlat(join(here, 'dashboard'), join(out, 'dashboard'));
const copiedShots = copyFlat(join(here, 'screenshots'), join(out, 'screenshots'));
if (!dashNames.includes('index.html')) {
  console.error('token radar: dashboard/index.html is missing');
  process.exit(1);
}
if (copiedShots.length !== shotNames.length) {
  console.error('token radar: a screenshot was not copied');
  process.exit(1);
}

// Last, byte for byte what the gate rebuilds from this /output.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const covered = Math.round(radar.covered_tvl_usd / 1e9);
console.log(
  `token radar: ${radar.tracked_size} tracked, ${radar.watchlist_size} on the watchlist, ${radar.board_size} ranked (${radar.early_size} early, ${radar.live_size} live), $${covered}B TVL covered`,
);
console.log(`token radar: wrote board.json, data.js, dashboard/ (${dashNames.length} files), screenshots/ (${copiedShots.length}), dossier.json`);
