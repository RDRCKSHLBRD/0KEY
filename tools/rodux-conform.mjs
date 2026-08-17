#!/usr/bin/env node
/**
 * rodux-conform — RODUX doctrine conformance checker
 *
 *   node rodux-conform.mjs <dir> [--json] [--quiet] [--fail-on N]
 *
 * Rules
 *   R1  DOM writes outside the sink        (JS)   CSS is a dumb renderer; only
 *                                                 CSSVarSink.js touches the DOM.
 *   R2  Layout decisions inside CSS        (CSS)  @media/calc/vw/vh/clamp mean CSS
 *                                                 is deciding; JS owns layout math.
 *   R3  Token hygiene                      (CSS)  Raw hex outside :root, and two
 *                                                 token names for one value.
 *
 * Exit code is the violation count (capped at 100), so CI can gate on it.
 * --fail-on N exits 0 while total <= N, for ratcheting an app down over time.
 */

import fs from 'fs';
import path from 'path';

const SINK_FILES = ['CSSVarSink.js', 'cssVarSink.js'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.backups', 'coverage']);
const SKIP_FILE = /\.(min|bundle)\.|\.pre-migrate\.|\.backup$|\.bak$/;

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------
const R1_PATTERNS = [
    { re: /\.style\s*\.\s*[a-zA-Z]/g,            note: 'direct style property write' },
    { re: /\.style\s*\.\s*setProperty\s*\(/g,    note: 'setProperty outside sink' },
    { re: /\.setProperty\s*\(\s*['"`]--/g,       note: 'CSS var write outside sink' },
    { re: /\.classList\s*\.\s*(add|remove|toggle|replace)\s*\(/g, note: 'classList mutation' },
    { re: /\.setAttribute\s*\(\s*['"`]style['"`]/g, note: 'style attribute write' },
    { re: /\.cssText\s*=/g,                      note: 'cssText assignment' },
    { re: /\.innerHTML\s*=/g,                    note: 'innerHTML assignment' }
];

const R2_PATTERNS = [
    { re: /@media[^{]*\{/g,        note: 'media query — breakpoint belongs in pickProfile()' },
    { re: /calc\s*\(/g,            note: 'calc() — arithmetic belongs in JS' },
    { re: /(?<![\w-])\d+(\.\d+)?(vw|vh|vmin|vmax)\b/g, note: 'viewport unit — JS should measure' },
    { re: /clamp\s*\(/g,           note: 'clamp() — ratio belongs in RatioEngine' },
    { re: /!important/g,           note: '!important — specificity fight' },
    { re: /:\s*(min|max)-content\b/g, note: 'intrinsic sizing — content measure belongs in JS' }
];

// prefers-reduced-motion is an accessibility signal, not a layout breakpoint.
const R2_MEDIA_ALLOW = /@media[^{]*prefers-(reduced-motion|color-scheme)/;

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

// ---------------------------------------------------------------------------
function walk(dir, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return out; }
    for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) walk(full, out);
        } else if (!SKIP_FILE.test(e.name)) {
            out.push(full);
        }
    }
    return out;
}

function lineOf(src, index) {
    return src.slice(0, index).split('\n').length;
}

function scan(src, patterns, allow) {
    const hits = [];
    for (const { re, note } of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
            const line = lineOf(src, m.index);
            const text = src.split('\n')[line - 1]?.trim().slice(0, 90) || '';
            if (allow && allow.test(m[0])) continue;
            hits.push({ line, note, snippet: text });
            if (m.index === re.lastIndex) re.lastIndex++;
        }
    }
    return hits.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// R3 — token hygiene
// ---------------------------------------------------------------------------
function auditTokens(files) {
    const declared = new Map();   // token -> [{file, value}]
    const byValue = new Map();    // normalized hex -> Set(token)
    const rawHex = [];            // hex used outside a custom-property declaration

    for (const file of files) {
        if (!file.endsWith('.css')) continue;
        const src = fs.readFileSync(file, 'utf8');
        const lines = src.split('\n');

        lines.forEach((line, i) => {
            const decl = line.match(/(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
            if (decl) {
                const [, token, value] = decl;
                const norm = value.toLowerCase();
                if (!declared.has(token)) declared.set(token, []);
                declared.get(token).push({ file, value: norm, line: i + 1 });
                if (!byValue.has(norm)) byValue.set(norm, new Set());
                byValue.get(norm).add(token);
                return;
            }
            // hex not part of a token declaration
            const found = line.match(HEX);
            if (found && !/^\s*(\/\*|\*)/.test(line)) {
                for (const h of found) {
                    rawHex.push({ file, line: i + 1, value: h.toLowerCase(), snippet: line.trim().slice(0, 90) });
                }
            }
        });
    }

    const aliases = [...byValue.entries()]
        .filter(([, tokens]) => tokens.size > 1)
        .map(([value, tokens]) => ({ value, tokens: [...tokens].sort() }))
        .sort((a, b) => b.tokens.length - a.tokens.length);

    const redefined = [...declared.entries()]
        .filter(([, defs]) => new Set(defs.map(d => d.value)).size > 1)
        .map(([token, defs]) => ({ token, values: defs }));

    return { declared, aliases, rawHex, redefined };
}

// ---------------------------------------------------------------------------
function main() {
    const args = process.argv.slice(2);
    const root = args.find(a => !a.startsWith('--')) || '.';
    const asJson = args.includes('--json');
    const quiet = args.includes('--quiet');
    const failIdx = args.indexOf('--fail-on');
    const failOn = failIdx > -1 ? Number(args[failIdx + 1]) : 0;

    const files = walk(root);
    const report = { root, r1: [], r2: [], r3: null, totals: {} };

    for (const file of files) {
        const rel = path.relative(root, file);
        const base = path.basename(file);
        let src;
        try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }

        if (/\.(js|mjs|cjs)$/.test(file)) {
            if (SINK_FILES.includes(base)) continue;
            const hits = scan(src, R1_PATTERNS);
            if (hits.length) report.r1.push({ file: rel, hits });
        }

        if (file.endsWith('.css')) {
            const hits = scan(src, R2_PATTERNS).filter(h =>
                !(h.note.startsWith('media query') && R2_MEDIA_ALLOW.test(h.snippet)));
            if (hits.length) report.r2.push({ file: rel, hits });
        }
    }

    report.r3 = auditTokens(files);

    const r1n = report.r1.reduce((s, f) => s + f.hits.length, 0);
    const r2n = report.r2.reduce((s, f) => s + f.hits.length, 0);
    const r3n = report.r3.aliases.length + report.r3.rawHex.length + report.r3.redefined.length;
    report.totals = { r1: r1n, r2: r2n, r3: r3n, all: r1n + r2n + r3n,
                      filesScanned: files.length,
                      sinkPresent: files.some(f => SINK_FILES.includes(path.basename(f))) };

    if (asJson) {
        const out = {
            ...report,
            r3: {
                tokensDeclared: report.r3.declared.size,
                aliases: report.r3.aliases,
                redefined: report.r3.redefined,
                rawHexCount: report.r3.rawHex.length,
                rawHex: report.r3.rawHex.slice(0, 50)
            }
        };
        console.log(JSON.stringify(out, null, 2));
    } else {
        const bar = '─'.repeat(64);
        console.log(`\n${bar}\nRODUX CONFORMANCE  ${path.resolve(root)}\n${bar}`);
        console.log(`files scanned      ${report.totals.filesScanned}`);
        console.log(`CSSVarSink.js      ${report.totals.sinkPresent ? 'present' : 'ABSENT  <- first-gen'}`);
        console.log(`\n  R1 DOM writes outside sink   ${String(r1n).padStart(4)}`);
        console.log(`  R2 layout decisions in CSS   ${String(r2n).padStart(4)}`);
        console.log(`  R3 token hygiene             ${String(r3n).padStart(4)}`);
        console.log(`  ${''.padEnd(28, ' ')}${String(report.totals.all).padStart(4)}  total\n`);

        if (!quiet) {
            if (r1n) {
                console.log(`${bar}\nR1 — DOM writes outside CSSVarSink.js\n${bar}`);
                for (const f of report.r1.sort((a, b) => b.hits.length - a.hits.length)) {
                    console.log(`\n  ${f.file}  (${f.hits.length})`);
                    for (const h of f.hits.slice(0, 6)) {
                        console.log(`    ${String(h.line).padStart(4)}  ${h.note}`);
                        console.log(`          ${h.snippet}`);
                    }
                    if (f.hits.length > 6) console.log(`    ... ${f.hits.length - 6} more`);
                }
            }
            if (r2n) {
                console.log(`\n${bar}\nR2 — layout decisions inside CSS\n${bar}`);
                for (const f of report.r2) {
                    console.log(`\n  ${f.file}  (${f.hits.length})`);
                    for (const h of f.hits) {
                        console.log(`    ${String(h.line).padStart(4)}  ${h.note}`);
                    }
                }
            }
            const { aliases, rawHex, redefined, declared } = report.r3;
            console.log(`\n${bar}\nR3 — token hygiene\n${bar}`);
            console.log(`  colour tokens declared   ${declared.size}`);
            console.log(`  distinct values aliased  ${aliases.length}`);
            console.log(`  raw hex outside tokens   ${rawHex.length}`);
            console.log(`  tokens redefined         ${redefined.length}`);
            if (aliases.length) {
                console.log(`\n  Two or more names for one value:`);
                for (const a of aliases) {
                    console.log(`    ${a.value}   ${a.tokens.join('  ')}`);
                }
            }
            if (redefined.length) {
                console.log(`\n  Token defined with conflicting values (theme blocks are expected):`);
                for (const r of redefined.slice(0, 12)) {
                    const vals = [...new Set(r.values.map(v => v.value))].join(' ');
                    console.log(`    ${r.token.padEnd(22)} ${vals}`);
                }
            }
            if (rawHex.length) {
                console.log(`\n  Raw hex outside a token declaration (first 12):`);
                for (const h of rawHex.slice(0, 12)) {
                    console.log(`    ${path.basename(h.file)}:${h.line}  ${h.value}   ${h.snippet}`);
                }
            }
        }
        console.log('');
    }

    const total = report.totals.all;
    process.exit(total <= failOn ? 0 : Math.min(total, 100));
}

main();
