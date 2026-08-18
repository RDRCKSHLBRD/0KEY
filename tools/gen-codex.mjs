#!/usr/bin/env node
// ---------------------------------------------------------------------------
// 0KEY — CODEX GENERATOR
// path: tools/gen-codex.mjs
//
//   0key_codex.json-r   machine codex (full payload, single source of truth)
//   0key_codex.txt      reading codex (80-rule separators, FILE PATH: headers)
//
// Walks the real filesystem. All paths resolve against this module, never CWD.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', '.archive', 'dist', 'build', 'coverage', '.vscode']);
const SKIP_FILES = new Set(['package-lock.json', '0key_codex.json-r', '0key_codex.txt']);
const SKIP_EXT = /\.(pre-rodux|orphan|bak|backup)$/;
const INCLUDE_EXT = new Set(['.html', '.css', '.js', '.mjs', '.cjs', '.json', '.json-r', '.sh', '.svg', '.md']);
const MAX_INLINE_BYTES = 24000;

const RULE = '='.repeat(80);
const SUB = '-'.repeat(80);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs, out);
      continue;
    }
    if (SKIP_FILES.has(name) || SKIP_EXT.test(name)) continue;
    if (!INCLUDE_EXT.has(extname(name))) continue;
    out.push(abs);
  }
  return out;
}

const files = walk(ROOT);
if (!files.length) {
  console.error('gen-codex: no files collected — check SKIP/INCLUDE rules and ROOT.');
  process.exit(1);
}

const payload = {};
const manifest = [];

for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const text = readFileSync(abs, 'utf8');
  const bytes = Buffer.byteLength(text, 'utf8');
  payload[rel] = text;
  manifest.push({
    path: rel,
    bytes,
    lines: text.split('\n').length,
    sha256: createHash('sha256').update(text).digest('hex').slice(0, 16),
    elidedInReadingCodex: bytes > MAX_INLINE_BYTES
  });
}

const generated = new Date().toISOString();

const codex = {
  _meta: {
    project: '0KEY',
    environment: 'RODUX_ENV',
    type: 'machine-agent-codex',
    schema: 'CODEX_SCHEMA_V1',
    generated,
    fileCount: manifest.length,
    totalBytes: manifest.reduce((n, m) => n + m.bytes, 0),
    manifest
  },
  payload
};

const jsonPath = join(ROOT, '0key_codex.json-r');
writeFileSync(jsonPath, JSON.stringify(codex, null, 2) + '\n', 'utf8');

let txt = RULE + '\n0KEY — PROJECT CODEX\n';
txt += `environment: RODUX_ENV   schema: CODEX_SCHEMA_V1\n`;
txt += `generated:   ${generated}\nfiles:       ${manifest.length}\n` + RULE + '\n\n';
txt += SUB + '\nMANIFEST\n' + SUB + '\n';
for (const m of manifest) {
  txt += `${String(m.lines).padStart(6)} lines  ${String(m.bytes).padStart(8)} B  ${m.path}`;
  txt += m.elidedInReadingCodex ? '  [ELIDED]\n' : '\n';
}
txt += '\n';

for (const m of manifest) {
  txt += RULE + `\nFILE PATH: ${m.path}\n`;
  txt += `LINES: ${m.lines}   BYTES: ${m.bytes}   SHA256: ${m.sha256}\n` + SUB + '\n';
  if (m.elidedInReadingCodex) {
    txt += `[elided — ${m.bytes} bytes exceeds MAX_INLINE_BYTES ${MAX_INLINE_BYTES}]\n`;
    txt += `[full content present in 0key_codex.json-r]\n`;
  } else {
    const body = payload[m.path];
    txt += body.endsWith('\n') ? body : body + '\n';
  }
  txt += '\n';
}

writeFileSync(join(ROOT, '0key_codex.txt'), txt, 'utf8');

console.log(RULE);
console.log('0KEY CODEX GENERATED');
console.log(RULE);
console.log(`root            ${ROOT}`);
console.log(`files collected ${manifest.length}`);
console.log(`total bytes     ${codex._meta.totalBytes}`);
console.log('');
for (const m of manifest) console.log(`  ${m.path}`);
