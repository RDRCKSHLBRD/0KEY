// ---------------------------------------------------------------------------
// 0KEY — BROWSER PROBE
// path: public/probe.js
//
// Verifies at runtime what the Node gate cannot see: that every role token
// actually resolves to a colour, that geometry is stamped, and that no page
// carries inline style writes.
//
// Run on any page:
//     await import('/probe.js')
// or paste this file's contents straight into the console.
// ---------------------------------------------------------------------------

async function RDXProbe() {
    const RUNTIME = ['--app-w', '--app-h', '--x', '--y', '--active', '--char'];
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    let pass = 0, fail = 0;
    const fails = [];

    const ok = (desc, cond, detail = '') => {
        if (cond) { pass++; console.log(`%c ok %c ${desc}`, 'color:#10B981', ''); }
        else {
            fail++; fails.push(desc);
            console.log(`%cFAIL%c ${desc}${detail ? '  — ' + detail : ''}`, 'color:#EF4444', '');
        }
    };

    const raw = name => cs.getPropertyValue(name).trim();

    /** Does `var(name)` actually produce a colour, or does the chain break? */
    function resolvesToColour(name) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.visibility = 'hidden';
        el.style.backgroundColor = `var(${name})`;
        document.body.appendChild(el);
        const v = getComputedStyle(el).backgroundColor;
        el.remove();
        return (v && v !== 'rgba(0, 0, 0, 0)') ? v : null;
    }

    console.log('%c0KEY PROBE', 'font-weight:800;font-size:14px');

    // --- page identity -----------------------------------------------------
    console.group('page identity');
    ok('title carries >KEY<', document.title.includes('>KEY<'), document.title);

    const sheets = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href'));
    ok('links palette.css', sheets.some(h => h.endsWith('palette.css')), sheets.join(', '));
    ok('links key.css', sheets.some(h => h.endsWith('key.css')), sheets.join(', '));
    ok('links no other stylesheet', sheets.length === 2, sheets.join(', '));

    const mod = root.dataset.module;
    ok('data-module is stamped', Boolean(mod), String(mod));
    ok('data-module is a known module', ['index', 'arcade', 'dojo'].includes(mod), String(mod));
    console.groupEnd();

    // --- geometry ----------------------------------------------------------
    console.group('geometry');
    for (const g of ['--shell-w', '--shell-h', '--rule-thin', '--rule-thick', '--brand-h']) {
        ok(`${g} stamped`, /^\d/.test(raw(g)), raw(g) || '(empty)');
    }
    ok('--app-w tracks innerWidth', raw('--app-w') === `${window.innerWidth}px`, raw('--app-w'));
    ok('--app-h tracks innerHeight', raw('--app-h') === `${window.innerHeight}px`, raw('--app-h'));

    if (mod === 'arcade') {
        ok('--node-size stamped', /^\d/.test(raw('--node-size')), raw('--node-size'));
        ok('--grid-size stamped', /^\d/.test(raw('--grid-size')), raw('--grid-size'));
    }

    const shell = document.getElementById('rodux-app');
    if (shell) {
        const want = parseFloat(raw('--shell-w'));
        ok('shell measures --shell-w', Math.abs(shell.offsetWidth - want) < 1,
            `measured ${shell.offsetWidth}, stamped ${want}`);
    }
    console.groupEnd();

    // --- roles resolve to real colour --------------------------------------
    console.group('colour roles');
    const ROLES = ['--c-bg-core', '--c-surface', '--c-ink-main', '--c-ink-muted',
                   '--c-accent-blue', '--c-accent-red', '--c-accent-green', '--c-scrim'];
    for (const r of ROLES) {
        const v = resolvesToColour(r);
        ok(`${r} resolves`, v !== null, v === null ? `${raw(r) || '(unstamped)'} does not resolve` : v);
    }
    console.groupEnd();

    // --- every var() used in CSS is accounted for --------------------------
    // Checked against data/codex.json, not a hardcoded list. Tokens scoped to
    // another module are excluded rather than reported missing.
    console.group('token coverage');
    const codex = await (await fetch('/data/codex.json')).json();
    const moduleScoped = new Set(Object.keys(codex.arcade ?? {}));
    const notThisModule = mod === 'arcade' ? new Set() : moduleScoped;

    const expected = new Set([
        ...Object.keys(codex.geometry ?? {}),
        ...Object.keys(codex.themes?.[codex.modules?.[mod]?.theme] ?? {}),
        ...(mod === 'arcade' ? moduleScoped : []),
        ...RUNTIME
    ]);

    let cssText = '';
    for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) cssText += rule.cssText + '\n'; }
        catch { /* cross-origin sheet, skip */ }
    }
    const used = [...new Set([...cssText.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))];

    const unresolved = used.filter(n =>
        !notThisModule.has(n) && !expected.has(n) && !raw(n) && !cssText.includes(`${n}:`));
    ok(`all ${used.length} referenced tokens are declared or stamped`,
        unresolved.length === 0, unresolved.join(', '));

    // Stronger: everything the codex promises this module is actually present.
    const promised = [...expected].filter(n => !RUNTIME.includes(n));
    const unstamped = promised.filter(n => !raw(n));
    ok(`all ${promised.length} codex tokens for "${mod}" are stamped`,
        unstamped.length === 0, unstamped.join(', '));
    console.groupEnd();

    // --- no inline style writes --------------------------------------------
    // The sink stamps custom properties only. A standard property in a style
    // attribute means hand-written markup or a foreign file.
    console.group('inline style audit');
    const offenders = [];
    for (const el of document.querySelectorAll('[style]')) {
        const std = [...el.style].filter(p => !p.startsWith('--'));
        if (std.length) offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}: ${std.join(', ')}`);
    }
    ok('no standard properties written inline', offenders.length === 0, offenders.slice(0, 5).join(' | '));
    console.groupEnd();

    // --- dojo cursor -------------------------------------------------------
    if (mod === 'dojo') {
        console.group('dojo');
        const cur = document.getElementById('text-cursor');
        const typed = document.getElementById('text-typed');
        const untyped = document.getElementById('text-untyped');
        const whole = (typed?.textContent || '') + (cur?.textContent || '') + (untyped?.textContent || '');
        console.log(`  cursor char: ${JSON.stringify(cur?.textContent)}`);
        console.log(`  full form:   ${JSON.stringify(whole)}`);
        ok('cursor holds a character when a kata is loaded',
            whole.length === 0 || (cur?.textContent || '').length === 1,
            'if this fails the form is losing its first character');
        console.groupEnd();
    }

    const total = pass + fail;
    console.log(
        `%cPROBE ${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${total}`,
        `font-weight:800;color:${fail === 0 ? '#10B981' : '#EF4444'}`
    );
    if (fail) console.log('failing:', fails);

    return { pass, fail, total };
}

export default await RDXProbe();
