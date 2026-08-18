// ---------------------------------------------------------------------------
// 0KEY — CSSVarSink
// path: public/sink/CSSVarSink.js
//
// The sole low-level DOM writer, and the only reader of data/codex.json.
//
// A sink stamps values. It does not make decisions:
//   allowed   custom properties, textContent, data-* attributes, classes
//   refused   layout properties, innerHTML, cssText, standard setProperty
//
// boot(module) fetches the codex, stamps geometry + the module's theme roles
// onto <html>, tags [data-module], and returns the codex. Every page awaits it
// before wiring anything.
// ---------------------------------------------------------------------------

const CODEX_SOURCE = '/data/codex.json';

export function stampVar(el, name, value) {
    el.style.setProperty(name, value);
}

export function stampVars(el, tokens) {
    for (const [name, value] of Object.entries(tokens)) {
        el.style.setProperty(name, value);
    }
}

export function stampState(el, key, value) {
    const next = String(value);
    if (el.dataset[key] !== next) el.dataset[key] = next;
}

export function stampText(el, text) {
    const next = String(text);
    if (el.textContent !== next) el.textContent = next;
}

export function stampClass(el, name, on) {
    el.classList.toggle(name, Boolean(on));
}

/** Measure the shell. No stylesheet ever asks the viewport for its own size. */
export function stampShell() {
    stampVars(document.documentElement, {
        '--app-w': `${window.innerWidth}px`,
        '--app-h': `${window.innerHeight}px`
    });
}

/**
 * Read the codex and dress the document for one module.
 * Throws loudly if the module is not declared — a silent fallback would mean
 * a page rendering with no roles stamped and no clue why.
 */
export async function boot(moduleName) {
    stampShell();
    window.addEventListener('resize', stampShell);

    const res = await fetch(CODEX_SOURCE);
    if (!res.ok) throw new Error(`CODEX UNREACHABLE ${res.status} ${CODEX_SOURCE}`);
    const codex = await res.json();

    const entry = codex.modules?.[moduleName];
    if (!entry) throw new Error(`CODEX DECLARES NO MODULE "${moduleName}"`);

    const theme = codex.themes?.[entry.theme];
    if (!theme) throw new Error(`CODEX DECLARES NO THEME "${entry.theme}"`);

    const root = document.documentElement;
    stampVars(root, codex.geometry ?? {});
    stampVars(root, theme);
    if (moduleName === 'arcade') stampVars(root, codex.arcade ?? {});

    stampState(root, 'module', moduleName);
    return codex;
}
