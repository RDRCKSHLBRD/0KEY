#!/usr/bin/env node
// ---------------------------------------------------------------------------
// 0KEY — SMOKE TESTS
// path: tools/smoke.mjs
//
// Covers the compute layer and — new in this pass — the codex contract:
// palette, themes, geometry, and the pages that consume them. Every failure
// mode this project actually hit is asserted here.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const R = p => join(ROOT, p);

const RED = '\x1b[31m', GRN = '\x1b[32m', DIM = '\x1b[2m', OFF = '\x1b[0m';
let passed = 0, failed = 0;

const G = name => console.log(`\n${DIM}${name}${OFF}`);
function ok(desc, cond, detail = '') {
  if (cond) { passed++; console.log(`${GRN}  ok${OFF}  ${desc}`); }
  else { failed++; console.log(`${RED}FAIL${OFF}  ${desc}${detail ? '  — ' + detail : ''}`); }
}
const eq = (d, a, b) => ok(d, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const flush = ms => new Promise(r => setTimeout(r, ms));

const RUNTIME_TOKENS = new Set(['--app-w', '--app-h', '--x', '--y', '--active', '--char']);

// ─── REPO STRUCTURE ─────────────────────────────────────────────────────────

G('repo structure');
{
  for (const p of [
    'server.js', 'package.json',
    'data/codex.json', 'data/bash_kata.json', 'data/js_kata.json',
    'public/index.html', 'public/dojo.html', 'public/arcade.html',
    'public/palette.css', 'public/key.css', 'tools/browser/probe.js',
    'public/core/Lattice.js', 'public/core/StateJS.js', 'public/core/KataEngine.js',
    'public/sink/CSSVarSink.js', 'public/sink/IndexSink.js',
    'public/sink/ArcadeSink.js', 'public/sink/KataSink.js',
    'tools/gen-codex.mjs', 'tools/rodux-conform.mjs'
  ]) ok(p, existsSync(R(p)));

  ok('no legacy style.css', !existsSync(R('public/style.css')));
  ok('no legacy dojo.css', !existsSync(R('public/dojo.css')));
}

// ─── PALETTE ────────────────────────────────────────────────────────────────

const paletteCss = readFileSync(R('public/palette.css'), 'utf8');
const paletteDecls = [...paletteCss.matchAll(/(--p-[\w-]+)\s*:\s*([^;]+);/g)]
  .map(m => ({ name: m[1], value: m[2].trim().toLowerCase() }));
const paletteNames = new Set(paletteDecls.map(d => d.name));

G('palette — one name per value, one value per name');
{
  ok('palette declares tokens', paletteDecls.length > 0);

  const dupNames = paletteDecls.map(d => d.name)
    .filter((n, i, a) => a.indexOf(n) !== i);
  ok('no token declared twice', dupNames.length === 0, [...new Set(dupNames)].join(', '));

  const byValue = new Map();
  for (const d of paletteDecls) {
    if (!byValue.has(d.value)) byValue.set(d.value, []);
    byValue.get(d.value).push(d.name);
  }
  const aliased = [...byValue.entries()].filter(([, n]) => n.length > 1);
  ok('no two names share a value', aliased.length === 0,
    aliased.map(([v, n]) => `${v}: ${n.join(' ')}`).join(' | '));

  ok('palette declares no role token', !/--c-[\w-]+\s*:/.test(paletteCss));
}

// ─── CODEX CONTRACT ─────────────────────────────────────────────────────────

const keyCodex = JSON.parse(readFileSync(R('data/codex.json'), 'utf8'));

G('codex.json — schema and structure');
{
  eq('project', keyCodex._meta?.project, '0KEY');
  eq('schema', keyCodex._meta?.schema, 'KEY_LATTICE_V1');
  ok('declares geometry', typeof keyCodex.geometry === 'object');
  ok('declares themes', typeof keyCodex.themes === 'object');
  ok('declares modules', typeof keyCodex.modules === 'object');
}

const themeNames = Object.keys(keyCodex.themes);
const roleKeys = new Set(Object.keys(keyCodex.themes[themeNames[0]]));

G('codex.json — every theme carries the identical role set');
{
  for (const t of themeNames) {
    const keys = Object.keys(keyCodex.themes[t]);
    const missing = [...roleKeys].filter(k => !keys.includes(k));
    const extra = keys.filter(k => !roleKeys.has(k));
    ok(`theme "${t}" has no missing role`, missing.length === 0, missing.join(', '));
    ok(`theme "${t}" has no stray role`, extra.length === 0, extra.join(', '));
  }
}

G('codex.json — every role resolves to a declared palette token');
{
  const broken = [];
  const referenced = new Set();
  for (const t of themeNames) {
    for (const [role, val] of Object.entries(keyCodex.themes[t])) {
      const m = /^var\(\s*(--p-[\w-]+)\s*\)$/.exec(val.trim());
      if (!m) { broken.push(`${t}.${role} = ${val}`); continue; }
      referenced.add(m[1]);
      if (!paletteNames.has(m[1])) broken.push(`${t}.${role} -> ${m[1]} undeclared`);
    }
  }
  ok('every role maps to an existing palette token', broken.length === 0, broken.join(' | '));

  const orphans = [...paletteNames].filter(n => !referenced.has(n));
  ok('no palette token is unused', orphans.length === 0, orphans.join(', '));
}

G('codex.json — every module names a theme that exists');
{
  for (const [name, entry] of Object.entries(keyCodex.modules)) {
    ok(`module "${name}" -> theme "${entry.theme}"`, themeNames.includes(entry.theme));
  }
}

// ─── STYLESHEET ─────────────────────────────────────────────────────────────

const keyCss = readFileSync(R('public/key.css'), 'utf8');

G('key.css — declares nothing, references only what is stamped');
{
  const hex = keyCss.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  ok('zero hex literals', hex.length === 0, hex.join(', '));

  const declared = keyCss.match(/^\s*--[\w-]+\s*:/gm) || [];
  ok('declares no custom property', declared.length === 0, declared.join(', '));

  const known = new Set([
    ...roleKeys,
    ...Object.keys(keyCodex.geometry),
    ...Object.keys(keyCodex.arcade ?? {}),
    ...RUNTIME_TOKENS
  ]);
  const used = [...new Set([...keyCss.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))];
  const unknown = used.filter(n => !known.has(n));
  ok(`all ${used.length} referenced tokens are stamped somewhere`,
    unknown.length === 0, unknown.join(', '));

  const unused = [...roleKeys].filter(r => !used.includes(r));
  ok('no role token is unused', unused.length === 0, unused.join(', '));
}

// ─── PAGES ──────────────────────────────────────────────────────────────────
// This group is the one that would have caught a foreign index.html.

G('pages — identity, stylesheets, and sink wiring');
{
  const pages = [
    { file: 'public/index.html',  sink: 'IndexSink.js' },
    { file: 'public/arcade.html', sink: 'ArcadeSink.js' },
    { file: 'public/dojo.html',   sink: 'KataSink.js' }
  ];

  for (const { file, sink } of pages) {
    const html = readFileSync(R(file), 'utf8');
    const tag = file.split('/').pop();

    const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
    ok(`${tag} title carries >KEY<`, title.includes('>KEY<'), title);

    const links = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
    ok(`${tag} links palette.css`, links.includes('palette.css'), links.join(', '));
    ok(`${tag} links key.css`, links.includes('key.css'), links.join(', '));
    eq(`${tag} links exactly two sheets`, links.length, 2);

    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
    eq(`${tag} loads exactly one module`, scripts.length, 1);
    ok(`${tag} loads sink/${sink}`, scripts[0] === `sink/${sink}`, scripts.join(', '));
    ok(`${tag} sink exists on disk`, existsSync(R(`public/${scripts[0]}`)));

    const inline = html.match(/\sstyle="[^"]*"/g) || [];
    ok(`${tag} has no inline style attribute`, inline.length === 0, inline.slice(0, 3).join(' '));

    const handlers = html.match(/\son(click|mouseover|mouseout|error|load)="/g) || [];
    ok(`${tag} has no inline event handler`, handlers.length === 0, handlers.join(' '));

    ok(`${tag} is 0KEY, not another project`,
      !/Interstellar|TSATELIER|landing\.css/.test(html));
  }
}

// ─── KATA DATA ──────────────────────────────────────────────────────────────

G('kata data — shape and typing traps');
{
  for (const f of ['data/bash_kata.json', 'data/js_kata.json']) {
    const d = JSON.parse(readFileSync(R(f), 'utf8'));
    const tag = f.split('/').pop();
    eq(`${tag} declares RODUX_KATA`, d._meta?.type, 'RODUX_KATA');
    ok(`${tag} names a module`, typeof d._meta?.module === 'string' && d._meta.module.length > 0);
    ok(`${tag} forms is a non-empty array`, Array.isArray(d.forms) && d.forms.length > 0);
    ok(`${tag} every form is a non-empty string`,
      d.forms.every(s => typeof s === 'string' && s.length > 0));
    const trailing = d.forms.filter(s => s !== s.trimEnd());
    ok(`${tag} no form has trailing whitespace`, trailing.length === 0, trailing.join(' | '));
    ok(`${tag} no form contains a tab`, d.forms.every(s => !s.includes('\t')));
    ok(`${tag} forms are unique`, new Set(d.forms).size === d.forms.length);
  }
}

// ─── GENERATED CODEX ────────────────────────────────────────────────────────

G('0key_codex.json-r — current with disk');
{
  const p = R('0key_codex.json-r');
  ok('generated codex exists  (npm run codex)', existsSync(p));
  if (existsSync(p)) {
    const c = JSON.parse(readFileSync(p, 'utf8'));
    eq('schema', c._meta?.schema, 'CODEX_SCHEMA_V1');

    const mPaths = c._meta.manifest.map(m => m.path).sort();
    const pPaths = Object.keys(c.payload).sort();
    ok('manifest and payload agree', mPaths.join('|') === pPaths.join('|'));

    const drift = c._meta.manifest.filter(m => {
      if (!existsSync(R(m.path))) return true;
      const sha = createHash('sha256').update(readFileSync(R(m.path), 'utf8')).digest('hex').slice(0, 16);
      return sha !== m.sha256;
    }).map(m => m.path);
    ok('codex matches disk  (if this fails: npm run codex)', drift.length === 0, drift.join(', '));
  }
}

// ─── LATTICE ────────────────────────────────────────────────────────────────

const { Lattice, lattice } = await import('../public/core/Lattice.js');

G('Lattice — the bus');
{
  const bus = new Lattice();
  let seen; bus.on('X', p => { seen = p; }); bus.dispatch('X', 42);
  eq('payload is delivered', seen, 42);

  let n = 0; bus.on('Y', () => n++); bus.on('Y', () => n++); bus.dispatch('Y');
  eq('every listener on a channel fires', n, 2);

  let leaked = false; bus.on('A', () => { leaked = true; }); bus.dispatch('B');
  eq('channels are isolated', leaked, false);

  let threw = false;
  try { bus.dispatch('NOBODY_LISTENING', 1); } catch { threw = true; }
  eq('dispatch to an empty channel is a no-op', threw, false);

  const fresh = new Lattice();
  let cross = false; fresh.on('X', () => { cross = true; }); bus.dispatch('X', 1);
  eq('instances do not share listeners', cross, false);
}

// ─── STATEJS ────────────────────────────────────────────────────────────────

const { stateJS } = await import('../public/core/StateJS.js');
const { kataEngine } = await import('../public/core/KataEngine.js');

G('StateJS — boot shape');
{
  eq('ten nodes in the pool', stateJS.state.nodes.length, 10);
  eq('not playing at boot', stateJS.state.isPlaying, false);
  eq('ten misses allowed', stateJS.state.maxMisses, 10);
  ok('every node starts inactive', stateJS.state.nodes.every(n => n.active === 0));
}

G('StateJS — VIEWPORT_SYNC is the only dimension source');
{
  lattice.dispatch('VIEWPORT_SYNC', { w: 640, h: 480 });
  eq('width syncs', stateJS.state.viewportWidth, 640);
  eq('height syncs', stateJS.state.viewportHeight, 480);
}

G('StateJS — spawn');
{
  lattice.dispatch('INIT_GAME');
  eq('run is live', stateJS.state.isPlaying, true);
  eq('score resets', stateJS.state.score, 0);
  eq('misses reset', stateJS.state.missed, 0);
  eq('pool cleared', stateJS.state.nodes.filter(n => n.active === 1).length, 0);

  lattice.dispatch('SPAWN');
  const live = stateJS.state.nodes.filter(n => n.active === 1);
  eq('one node spawned', live.length, 1);
  const n = live[0];
  eq('spawns above the ceiling', n.y, -40);
  eq('spawns falling', n.status, 'falling');
  ok('spawn x is inside the viewport', n.x >= 0 && n.x <= 600, `x=${n.x}`);
  ok('spawn char is A-Z', /^[A-Z]$/.test(n.char), n.char);

  for (let i = 0; i < 25; i++) lattice.dispatch('SPAWN');
  eq('pool caps at ten', stateJS.state.nodes.filter(n => n.active === 1).length, 10);
}

G('StateJS — hits score, non-matches do not');
{
  lattice.dispatch('INIT_GAME');
  lattice.dispatch('SPAWN');
  const t = stateJS.state.nodes.find(n => n.active === 1);
  lattice.dispatch('KEY_PRESS', t.char);
  eq('a hit scores ten', stateJS.state.score, 10);
  eq('the struck node is marked hit', t.status, 'hit');
  const miss = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => c !== t.char);
  lattice.dispatch('KEY_PRESS', miss);
  eq('a non-match does not score', stateJS.state.score, 10);
}

await flush(90);

G('StateJS — a node past the floor is a miss');
{
  lattice.dispatch('INIT_GAME');
  lattice.dispatch('VIEWPORT_SYNC', { w: 640, h: 100 });
  lattice.dispatch('SPAWN');
  lattice.dispatch('TICK', 1000);
  eq('the miss is counted', stateJS.state.missed, 1);
  eq('the node is retired', stateJS.state.nodes.filter(n => n.active === 1).length, 0);
}

G('StateJS — the run ends at ten misses');
{
  lattice.dispatch('INIT_GAME');
  lattice.dispatch('VIEWPORT_SYNC', { w: 640, h: 100 });
  for (let i = 0; i < 10; i++) lattice.dispatch('SPAWN');
  eq('ten in flight', stateJS.state.nodes.filter(n => n.active === 1).length, 10);
  lattice.dispatch('TICK', 1000);
  eq('ten misses recorded', stateJS.state.missed, 10);
  eq('the run stops', stateJS.state.isPlaying, false);
  const before = stateJS.state.missed;
  lattice.dispatch('TICK', 1000);
  eq('a stopped run ignores ticks', stateJS.state.missed, before);
}

// ─── KATAENGINE ─────────────────────────────────────────────────────────────

G('KataEngine — INIT_DOJO');
{
  lattice.dispatch('SET_MODE', 'shaolin');
  lattice.dispatch('INIT_DOJO', ['ab', 'cd']);
  eq('dojo is active', kataEngine.state.isActive, true);
  eq('starts at form zero', kataEngine.state.currentFormIdx, 0);
  eq('starts at char zero', kataEngine.state.currentCharIdx, 0);
  eq('mistakes reset', kataEngine.state.totalMistakes, 0);
  eq('no reps owed', kataEngine.state.repsRequired, 0);
  eq('mode is shaolin', kataEngine.state.mode, 'shaolin');
}

G('KataEngine — the first character is never skipped');
{
  lattice.dispatch('INIT_DOJO', ['chmod +x setup.sh']);
  const s = kataEngine.state;
  const form = s.forms[s.currentFormIdx];
  const idx = s.currentCharIdx;
  eq('cursor sits on index zero', idx, 0);
  eq('typed slice is empty', form.slice(0, idx), '');
  eq('cursor character is the first', form[idx], 'c');
  eq('typed + cursor + untyped reconstructs the form',
    form.slice(0, idx) + form[idx] + form.slice(idx + 1), form);
}

G('KataEngine — correct keys advance');
{
  lattice.dispatch('INIT_DOJO', ['ab', 'cd']);
  lattice.dispatch('KEY_PRESS', 'a');
  eq('cursor advances', kataEngine.state.currentCharIdx, 1);
  lattice.dispatch('KEY_PRESS', 'b');
  eq('form completes and index advances', kataEngine.state.currentFormIdx, 1);
  eq('cursor rewinds for the new form', kataEngine.state.currentCharIdx, 0);
}

G('KataEngine — modifier keys are neither hits nor misses');
{
  lattice.dispatch('INIT_DOJO', ['ab']);
  lattice.dispatch('KEY_PRESS', 'Shift');
  lattice.dispatch('KEY_PRESS', 'ArrowLeft');
  eq('no mistake recorded', kataEngine.state.totalMistakes, 0);
  eq('cursor unmoved', kataEngine.state.currentCharIdx, 0);
}

G('KataEngine — shaolin resets the form and demands four reps');
{
  lattice.dispatch('SET_MODE', 'shaolin');
  lattice.dispatch('INIT_DOJO', ['abc']);
  lattice.dispatch('KEY_PRESS', 'a');
  lattice.dispatch('KEY_PRESS', 'x');
  eq('the mistake is counted', kataEngine.state.totalMistakes, 1);
  eq('cursor resets to zero', kataEngine.state.currentCharIdx, 0);
  eq('four reps are owed', kataEngine.state.repsRequired, 4);
}

G('KataEngine — forgiving mode counts but holds position');
{
  lattice.dispatch('SET_MODE', 'forgiving');
  lattice.dispatch('INIT_DOJO', ['abc']);
  lattice.dispatch('KEY_PRESS', 'a');
  lattice.dispatch('KEY_PRESS', 'x');
  eq('the mistake is counted', kataEngine.state.totalMistakes, 1);
  eq('cursor holds', kataEngine.state.currentCharIdx, 1);
  eq('no reps are owed', kataEngine.state.repsRequired, 0);
}

G('KataEngine — reps are served before the form is released');
{
  let completed = false;
  lattice.on('DOJO_COMPLETE', () => { completed = true; });
  lattice.dispatch('SET_MODE', 'shaolin');
  lattice.dispatch('INIT_DOJO', ['ab']);
  lattice.dispatch('KEY_PRESS', 'a');
  lattice.dispatch('KEY_PRESS', 'x');
  eq('four reps owed after the miss', kataEngine.state.repsRequired, 4);
  for (let rep = 0; rep < 3; rep++) {
    lattice.dispatch('KEY_PRESS', 'a');
    lattice.dispatch('KEY_PRESS', 'b');
  }
  eq('three served, one owed', kataEngine.state.repsRequired, 1);
  eq('still on the same form', kataEngine.state.currentFormIdx, 0);
  lattice.dispatch('KEY_PRESS', 'a');
  lattice.dispatch('KEY_PRESS', 'b');
  eq('debt cleared', kataEngine.state.repsRequired, 0);
  eq('dojo closes on the last form', kataEngine.state.isActive, false);
  ok('DOJO_COMPLETE fired', completed);
}

G('KataEngine — a closed dojo ignores input');
{
  const before = kataEngine.state.totalMistakes;
  lattice.dispatch('KEY_PRESS', 'z');
  eq('no mistake recorded after close', kataEngine.state.totalMistakes, before);
}

// ─── TALLY ──────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log('\n' + '─'.repeat(64));
console.log(failed === 0
  ? `${GRN}SMOKE PASS${OFF}  ${passed}/${total}`
  : `${RED}SMOKE FAIL${OFF}  ${passed}/${total}   ${failed} failing`);
console.log('─'.repeat(64) + '\n');

process.exit(failed === 0 ? 0 : 1);
